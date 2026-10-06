package reservation

import (
	"errors"
	"sync"
	"time"
)

var (
	ErrReservationNotFound    = errors.New("reservation not found")
	ErrIdempotencyConflict    = errors.New("idempotency key conflict")
	ErrInventoryNotFound      = errors.New("inventory not found")
	ErrStockPoolNotFound      = errors.New("stock pool not found")
	ErrOnHandVersionConflict  = errors.New("on-hand version conflict")
	ErrSKUConflict            = errors.New("sku conflict")
	ErrInvalidRequest         = errors.New("invalid reservation request")
	ErrReservationUnavailable = errors.New("reservation unavailable")
)

type Store interface {
	CreateReservation(reservation Reservation) (Reservation, error)
	FindByID(id string) (Reservation, bool)
	FindByIdempotencyKey(key string) (Reservation, bool)
	Save(reservation Reservation) error
	SetOnHandQuantity(request SetOnHandQuantityRequest) (InventoryBalance, error)
	RestoreSale(request RestoreSaleRequest) (RestoreSaleResponse, error)
}

type MemoryStore struct {
	mu               sync.Mutex
	byID             map[string]Reservation
	byIdempotencyKey map[string]string
	byOrderID        map[string]string
	pools            map[string]InventoryBalance
	defaultPoolByID  map[string]string
	items            map[string]InventoryItem
	movements        map[string][]InventoryMovement
	processedEvents  map[string]bool
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byID:             map[string]Reservation{},
		byIdempotencyKey: map[string]string{},
		byOrderID:        map[string]string{},
		pools:            map[string]InventoryBalance{},
		defaultPoolByID:  map[string]string{},
		items:            map[string]InventoryItem{},
		movements:        map[string][]InventoryMovement{},
		processedEvents:  map[string]bool{},
	}
}

func (s *MemoryStore) CreateReservation(reservation Reservation) (Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existingID, ok := s.byIdempotencyKey[reservation.IdempotencyKey]; ok {
		existing := s.byID[existingID]
		if sameReservation(existing, reservation) {
			return existing, nil
		}
		return Reservation{}, ErrIdempotencyConflict
	}
	if existingID, ok := s.byOrderID[reservation.OrderID]; ok {
		existing := s.byID[existingID]
		if sameReservation(existing, reservation) {
			return existing, nil
		}
		return Reservation{}, ErrIdempotencyConflict
	}
	if err := s.reserveItems(&reservation); err != nil {
		return Reservation{}, err
	}
	s.saveReservationLocked(reservation)

	return reservation, nil
}

func (s *MemoryStore) CreateReservationWithoutInventoryMutation(reservation Reservation) (Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existingID, ok := s.byIdempotencyKey[reservation.IdempotencyKey]; ok {
		existing := s.byID[existingID]
		if sameReservation(existing, reservation) {
			return existing, nil
		}
		return Reservation{}, ErrIdempotencyConflict
	}
	if existingID, ok := s.byOrderID[reservation.OrderID]; ok {
		existing := s.byID[existingID]
		if sameReservation(existing, reservation) {
			return existing, nil
		}
		return Reservation{}, ErrIdempotencyConflict
	}
	for index := range reservation.Items {
		if _, ok := s.resolvePoolID(&reservation.Items[index]); !ok {
			return Reservation{}, ErrStockPoolNotFound
		}
	}
	s.saveReservationLocked(reservation)
	return reservation, nil
}

func (s *MemoryStore) FindByID(id string) (Reservation, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	reservation, ok := s.byID[id]
	return cloneReservation(reservation), ok
}

func (s *MemoryStore) FindByIdempotencyKey(key string) (Reservation, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, ok := s.byIdempotencyKey[key]
	if !ok {
		return Reservation{}, false
	}

	reservation, ok := s.byID[id]
	return cloneReservation(reservation), ok
}

func (s *MemoryStore) Save(reservation Reservation) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, ok := s.byID[reservation.ID]
	if !ok {
		return ErrReservationNotFound
	}

	switch reservation.Status {
	case StatusReleased, StatusExpired:
		if current.Status == StatusActive {
			s.releaseItems(current, reservation.Status)
		} else if current.Status != StatusReleased && current.Status != StatusExpired {
			return ErrReservationUnavailable
		}
	case StatusSold:
		if current.Status == StatusActive {
			if !s.canConsumeItems(current.Items) {
				return ErrReservationUnavailable
			}
			s.consumeItems(current)
		} else if current.Status != StatusSold {
			return ErrReservationUnavailable
		}
	}

	// Preserve the recorded pool identity across status transitions.
	reservation.Items = current.Items
	s.saveReservationLocked(reservation)
	return nil
}

func (s *MemoryStore) SetOnHandQuantity(request SetOnHandQuantityRequest) (InventoryBalance, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	poolID := request.StockPoolID
	if poolID == "" {
		resolved, ok := s.defaultPoolByID[request.InventoryID]
		if !ok {
			return InventoryBalance{}, ErrStockPoolNotFound
		}
		poolID = resolved
	}

	balance, ok := s.pools[poolID]
	if !ok || balance.InventoryID != request.InventoryID {
		return InventoryBalance{}, ErrStockPoolNotFound
	}
	if balance.OnHandVersion != request.ExpectedOnHandVersion {
		return s.derived(balance), ErrOnHandVersionConflict
	}

	before := balance
	balance.OnHandQuantity = request.OnHandQuantity
	balance.OnHandVersion++
	s.pools[poolID] = s.derived(balance)
	s.appendMovement(poolID, InventoryMovement{
		InventoryID:    request.InventoryID,
		StockPoolID:    poolID,
		Kind:           MovementCount,
		QuantityDelta:  request.OnHandQuantity - before.OnHandQuantity,
		OnHandBefore:   before.OnHandQuantity,
		ReservedBefore: before.ReservedQuantity,
		OnHandAfter:    balance.OnHandQuantity,
		ReservedAfter:  balance.ReservedQuantity,
		Cause:          "seller_count",
		ActorID:        request.ActorID,
		CommandID:      request.IdempotencyKey,
		Note:           request.Note,
		OccurredAt:     time.Now(),
	})
	return s.derived(balance), nil
}

func (s *MemoryStore) RestoreSale(request RestoreSaleRequest) (RestoreSaleResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	reservation, ok := s.byID[request.ReservationID]
	if !ok {
		return RestoreSaleResponse{}, ErrReservationNotFound
	}

	if s.processedEvents[request.IdempotencyKey] {
		return RestoreSaleResponse{ReservationID: reservation.ID, Restored: true}, nil
	}
	s.processedEvents[request.IdempotencyKey] = true

	targets, ok := restrictRestoreTargets(reservation, request)
	if !ok {
		return RestoreSaleResponse{}, ErrReservationUnavailable
	}

	restored := false
	switch reservation.Status {
	case StatusActive:
		for _, item := range targets {
			balance := s.pools[item.StockPoolID]
			before := balance
			balance.ReservedQuantity -= item.Quantity
			if balance.ReservedQuantity < 0 {
				balance.ReservedQuantity = 0
			}
			s.pools[item.StockPoolID] = s.derived(balance)
			s.appendMovement(item.StockPoolID, InventoryMovement{
				InventoryID:    item.InventoryID,
				StockPoolID:    item.StockPoolID,
				Kind:           MovementRelease,
				QuantityDelta:  item.Quantity,
				OnHandBefore:   before.OnHandQuantity,
				ReservedBefore: before.ReservedQuantity,
				OnHandAfter:    balance.OnHandQuantity,
				ReservedAfter:  balance.ReservedQuantity,
				Cause:          request.Reason,
				CommandID:      request.IdempotencyKey,
				OccurredAt:     time.Now(),
			})
		}
		if len(targets) == len(reservation.Items) {
			reservation.Status = StatusReleased
		}
	case StatusSold:
		for _, item := range targets {
			balance := s.pools[item.StockPoolID]
			before := balance
			balance.OnHandQuantity += item.Quantity
			s.pools[item.StockPoolID] = s.derived(balance)
			s.appendMovement(item.StockPoolID, InventoryMovement{
				InventoryID:    item.InventoryID,
				StockPoolID:    item.StockPoolID,
				Kind:           MovementCorrection,
				QuantityDelta:  item.Quantity,
				OnHandBefore:   before.OnHandQuantity,
				ReservedBefore: before.ReservedQuantity,
				OnHandAfter:    balance.OnHandQuantity,
				ReservedAfter:  balance.ReservedQuantity,
				Cause:          request.Reason,
				CommandID:      request.IdempotencyKey,
				OccurredAt:     time.Now(),
			})
		}
		restored = true
	case StatusReleased, StatusExpired:
		return RestoreSaleResponse{ReservationID: reservation.ID, Restored: false}, nil
	}

	s.saveReservationLocked(reservation)

	return RestoreSaleResponse{ReservationID: reservation.ID, Restored: restored}, nil
}

func (s *MemoryStore) SetStockPoolBalance(balance InventoryBalance) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if balance.LifecycleState == "" {
		balance.LifecycleState = LifecycleActive
	}
	if balance.OnHandVersion == 0 {
		balance.OnHandVersion = 1
	}
	if balance.StockPoolID == "" {
		balance.StockPoolID = balance.InventoryID
	}
	if balance.InventoryID == "" {
		balance.InventoryID = balance.StockPoolID
	}
	s.pools[balance.StockPoolID] = s.derived(balance)
	if balance.IsDefault {
		s.defaultPoolByID[balance.InventoryID] = balance.StockPoolID
	}
}

func (s *MemoryStore) StockPoolBalance(stockPoolID string) InventoryBalance {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.derived(s.pools[stockPoolID])
}

func (s *MemoryStore) StockPoolMovements(stockPoolID string) []InventoryMovement {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]InventoryMovement(nil), s.movements[stockPoolID]...)
}

func (s *MemoryStore) SetInventoryItem(item InventoryItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if item.LifecycleState == "" {
		item.LifecycleState = LifecycleActive
	}
	if item.SKU != "" && item.LifecycleState != LifecycleRemoved {
		for _, existing := range s.items {
			if existing.ID != item.ID && existing.ShopID == item.ShopID && existing.SKU == item.SKU && existing.LifecycleState != LifecycleRemoved {
				return ErrSKUConflict
			}
		}
	}
	s.items[item.ID] = item
	return nil
}

func (s *MemoryStore) derived(balance InventoryBalance) InventoryBalance {
	balance.AvailableQuantityValue = balance.AvailableQuantity()
	balance.ShortageValue = balance.Shortage()
	return balance
}

func (s *MemoryStore) resolvePoolID(item *Item) (string, bool) {
	if item.StockPoolID != "" {
		if _, ok := s.pools[item.StockPoolID]; ok {
			return item.StockPoolID, true
		}
		return "", false
	}

	poolID, ok := s.defaultPoolByID[item.InventoryID]
	if !ok {
		return "", false
	}
	item.StockPoolID = poolID
	return poolID, true
}

func (s *MemoryStore) reserveItems(reservation *Reservation) error {
	for index := range reservation.Items {
		poolID, ok := s.resolvePoolID(&reservation.Items[index])
		if !ok {
			return ErrReservationUnavailable
		}
		balance := s.pools[poolID]
		if balance.LifecycleState == LifecycleRemoved || balance.AvailableQuantity() < reservation.Items[index].Quantity {
			return ErrReservationUnavailable
		}
	}

	for index := range reservation.Items {
		item := &reservation.Items[index]
		balance := s.pools[item.StockPoolID]
		before := balance
		balance.ReservedQuantity += item.Quantity
		s.pools[item.StockPoolID] = s.derived(balance)
		item.AvailableAfterReservation = balance.AvailableQuantity()
		s.appendMovement(item.StockPoolID, InventoryMovement{
			InventoryID:    item.InventoryID,
			StockPoolID:    item.StockPoolID,
			Kind:           MovementReserve,
			QuantityDelta:  item.Quantity,
			OnHandBefore:   before.OnHandQuantity,
			ReservedBefore: before.ReservedQuantity,
			OnHandAfter:    balance.OnHandQuantity,
			ReservedAfter:  balance.ReservedQuantity,
			Cause:          "checkout_quote",
			CommandID:      reservation.IdempotencyKey,
			OccurredAt:     time.Now(),
		})
	}
	return nil
}

func (s *MemoryStore) releaseItems(reservation Reservation, status Status) {
	for _, item := range reservation.Items {
		balance := s.pools[item.StockPoolID]
		before := balance
		balance.ReservedQuantity -= item.Quantity
		if balance.ReservedQuantity < 0 {
			balance.ReservedQuantity = 0
		}
		s.pools[item.StockPoolID] = s.derived(balance)
		s.appendMovement(item.StockPoolID, InventoryMovement{
			InventoryID:    item.InventoryID,
			StockPoolID:    item.StockPoolID,
			Kind:           MovementRelease,
			QuantityDelta:  item.Quantity,
			OnHandBefore:   before.OnHandQuantity,
			ReservedBefore: before.ReservedQuantity,
			OnHandAfter:    balance.OnHandQuantity,
			ReservedAfter:  balance.ReservedQuantity,
			Cause:          string(status),
			CommandID:      reservation.IdempotencyKey,
			OccurredAt:     time.Now(),
		})
	}
}

func (s *MemoryStore) canConsumeItems(items []Item) bool {
	for _, item := range items {
		balance, ok := s.pools[item.StockPoolID]
		if !ok || balance.OnHandQuantity < item.Quantity || balance.ReservedQuantity < item.Quantity {
			return false
		}
	}
	return true
}

func (s *MemoryStore) consumeItems(reservation Reservation) {
	for _, item := range reservation.Items {
		balance := s.pools[item.StockPoolID]
		before := balance
		balance.OnHandQuantity -= item.Quantity
		balance.ReservedQuantity -= item.Quantity
		s.pools[item.StockPoolID] = s.derived(balance)
		s.appendMovement(item.StockPoolID, InventoryMovement{
			InventoryID:    item.InventoryID,
			StockPoolID:    item.StockPoolID,
			Kind:           MovementSale,
			QuantityDelta:  -item.Quantity,
			OnHandBefore:   before.OnHandQuantity,
			ReservedBefore: before.ReservedQuantity,
			OnHandAfter:    balance.OnHandQuantity,
			ReservedAfter:  balance.ReservedQuantity,
			Cause:          "order_created",
			CommandID:      reservation.IdempotencyKey,
			OccurredAt:     time.Now(),
		})
	}
}

func (s *MemoryStore) appendMovement(stockPoolID string, movement InventoryMovement) {
	for _, existing := range s.movements[stockPoolID] {
		if existing.CommandID == movement.CommandID && existing.Kind == movement.Kind {
			return
		}
	}
	s.movements[stockPoolID] = append(s.movements[stockPoolID], movement)
}

func (s *MemoryStore) saveReservationLocked(reservation Reservation) {
	s.byID[reservation.ID] = cloneReservation(reservation)
	if reservation.IdempotencyKey != "" {
		s.byIdempotencyKey[reservation.IdempotencyKey] = reservation.ID
	}
	s.byOrderID[reservation.OrderID] = reservation.ID
}

func sameReservation(left Reservation, right Reservation) bool {
	return left.OrderID == right.OrderID &&
		left.CartID == right.CartID &&
		sameItems(left.Items, right.Items)
}

func cloneReservation(reservation Reservation) Reservation {
	reservation.Items = append([]Item(nil), reservation.Items...)
	if reservation.ProcessedEvent != nil {
		processed := map[string]time.Time{}
		for eventID, processedAt := range reservation.ProcessedEvent {
			processed[eventID] = processedAt
		}
		reservation.ProcessedEvent = processed
	}
	return reservation
}
