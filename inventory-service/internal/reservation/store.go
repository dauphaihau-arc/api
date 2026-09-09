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
	ErrOnHandVersionConflict  = errors.New("on-hand version conflict")
	ErrSKUConflict            = errors.New("sku conflict")
)

type Store interface {
	CreateReservation(reservation Reservation) (Reservation, error)
	FindByID(id string) (Reservation, bool)
	FindByIdempotencyKey(key string) (Reservation, bool)
	Save(reservation Reservation) error
	SetOnHandQuantity(request SetOnHandQuantityRequest) (InventoryBalance, error)
}

type MemoryStore struct {
	mu               sync.Mutex
	byID             map[string]Reservation
	byIdempotencyKey map[string]string
	inventory        map[string]InventoryBalance
	items            map[string]InventoryItem
	movements        map[string][]InventoryMovement
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byID:             map[string]Reservation{},
		byIdempotencyKey: map[string]string{},
		inventory:        map[string]InventoryBalance{},
		items:            map[string]InventoryItem{},
		movements:        map[string][]InventoryMovement{},
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
	if err := s.reserveItems(reservation); err != nil {
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

	s.saveReservationLocked(reservation)
	return nil
}

func (s *MemoryStore) SetOnHandQuantity(request SetOnHandQuantityRequest) (InventoryBalance, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	balance, ok := s.inventory[request.InventoryID]
	if !ok {
		return InventoryBalance{}, ErrInventoryNotFound
	}
	if balance.OnHandVersion != request.ExpectedOnHandVersion {
		return balance.withDerivedQuantities(), ErrOnHandVersionConflict
	}

	before := balance
	balance.OnHandQuantity = request.OnHandQuantity
	balance.OnHandVersion++
	s.inventory[request.InventoryID] = balance
	s.appendMovement(request.InventoryID, InventoryMovement{
		InventoryID:       request.InventoryID,
		Kind:              MovementCount,
		QuantityDelta:     request.OnHandQuantity - before.OnHandQuantity,
		OnHandBefore:      before.OnHandQuantity,
		ReservedBefore:    before.ReservedQuantity,
		OnHandAfter:       balance.OnHandQuantity,
		ReservedAfter:     balance.ReservedQuantity,
		Cause:             "seller_count",
		ActorID:           request.ActorID,
		CommandID:         request.IdempotencyKey,
		Note:              request.Note,
		OccurredAt:        time.Now(),
	})
	return balance.withDerivedQuantities(), nil
}

func (s *MemoryStore) SetInventoryBalance(id string, balance InventoryBalance) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if balance.LifecycleState == "" {
		balance.LifecycleState = LifecycleActive
	}
	s.inventory[id] = balance.withDerivedQuantities()
}

func (s *MemoryStore) InventoryBalance(id string) InventoryBalance {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.inventory[id].withDerivedQuantities()
}

func (s *MemoryStore) InventoryMovements(id string) []InventoryMovement {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]InventoryMovement(nil), s.movements[id]...)
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

func (s *MemoryStore) reserveItems(reservation Reservation) error {
	beforeByID := map[string]InventoryBalance{}
	for _, item := range sortItemsByInventoryID(reservation.Items) {
		balance, ok := s.inventory[item.InventoryID]
		if !ok || balance.LifecycleState == LifecycleRemoved || balance.AvailableQuantity() < item.Quantity {
			return ErrReservationUnavailable
		}
		beforeByID[item.InventoryID] = balance
	}
	for index := range reservation.Items {
		item := reservation.Items[index]
		balance := s.inventory[item.InventoryID]
		before := beforeByID[item.InventoryID]
		balance.ReservedQuantity += item.Quantity
		reservation.Items[index].AvailableAfterReservation = balance.AvailableQuantity()
		s.inventory[item.InventoryID] = balance.withDerivedQuantities()
		s.appendMovement(item.InventoryID, InventoryMovement{
			InventoryID:    item.InventoryID,
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
		balance := s.inventory[item.InventoryID]
		before := balance
		balance.ReservedQuantity -= item.Quantity
		if balance.ReservedQuantity < 0 {
			balance.ReservedQuantity = 0
		}
		s.inventory[item.InventoryID] = balance.withDerivedQuantities()
		s.appendMovement(item.InventoryID, InventoryMovement{
			InventoryID:    item.InventoryID,
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
		balance, ok := s.inventory[item.InventoryID]
		if !ok || balance.OnHandQuantity < item.Quantity || balance.ReservedQuantity < item.Quantity {
			return false
		}
	}
	return true
}

func (s *MemoryStore) consumeItems(reservation Reservation) {
	for _, item := range reservation.Items {
		balance := s.inventory[item.InventoryID]
		before := balance
		balance.OnHandQuantity -= item.Quantity
		balance.ReservedQuantity -= item.Quantity
		s.inventory[item.InventoryID] = balance.withDerivedQuantities()
		s.appendMovement(item.InventoryID, InventoryMovement{
			InventoryID:    item.InventoryID,
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

func (s *MemoryStore) appendMovement(inventoryID string, movement InventoryMovement) {
	for _, existing := range s.movements[inventoryID] {
		if existing.CommandID == movement.CommandID && existing.Kind == movement.Kind {
			return
		}
	}
	s.movements[inventoryID] = append(s.movements[inventoryID], movement)
}

func (s *MemoryStore) saveReservationLocked(reservation Reservation) {
	s.byID[reservation.ID] = cloneReservation(reservation)
	if reservation.IdempotencyKey != "" {
		s.byIdempotencyKey[reservation.IdempotencyKey] = reservation.ID
	}
}

func sameReservation(left Reservation, right Reservation) bool {
	return left.QuoteID == right.QuoteID &&
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
