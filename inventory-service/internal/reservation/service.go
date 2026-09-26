package reservation

import (
	"crypto/rand"
	"encoding/hex"
	"slices"
	"time"
)

type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
}

func (s *Service) ReserveQuote(request ReserveQuoteRequest) (ReserveQuoteResponse, error) {
	if request.QuoteID == "" || request.CartID == "" || request.IdempotencyKey == "" || len(request.Items) == 0 {
		return ReserveQuoteResponse{}, ErrInvalidRequest
	}
	for _, item := range request.Items {
		if item.InventoryID == "" || item.Quantity <= 0 {
			return ReserveQuoteResponse{}, ErrInvalidRequest
		}
	}

	reservation := Reservation{
		ID:             newID(),
		QuoteID:        request.QuoteID,
		CartID:         request.CartID,
		Status:         StatusActive,
		Items:          request.Items,
		ExpiresAt:      request.ExpiresAt,
		IdempotencyKey: request.IdempotencyKey,
		ProcessedEvent: map[string]time.Time{},
	}

	created, err := s.store.CreateReservation(reservation)
	if err != nil {
		return ReserveQuoteResponse{}, err
	}

	response := ReserveQuoteResponse{
		ReservationID: created.ID,
		Status:        created.Status,
	}
	for _, item := range created.Items {
		response.Items = append(response.Items, struct {
			InventoryID               string `json:"inventoryId"`
			Quantity                  int    `json:"quantity"`
			AvailableAfterReservation int    `json:"availableAfterReservation"`
		}{
			InventoryID:               item.InventoryID,
			Quantity:                  item.Quantity,
			AvailableAfterReservation: item.AvailableAfterReservation,
		})
	}

	return response, nil
}

func (s *Service) SetOnHandQuantity(request SetOnHandQuantityRequest) (SetOnHandQuantityResponse, error) {
	if request.InventoryID == "" || request.IdempotencyKey == "" || request.OnHandQuantity < 0 {
		return SetOnHandQuantityResponse{}, ErrInvalidRequest
	}

	balance, err := s.store.SetOnHandQuantity(request)
	response := SetOnHandQuantityResponse{
		StockPoolID:       balance.StockPoolID,
		InventoryID:       request.InventoryID,
		OnHandQuantity:    balance.OnHandQuantity,
		ReservedQuantity:  balance.ReservedQuantity,
		AvailableQuantity: balance.AvailableQuantity(),
		OnHandVersion:     balance.OnHandVersion,
		Shortage:          balance.Shortage(),
	}
	if err != nil {
		return response, err
	}

	return response, nil
}

func (s *Service) RestoreSale(request RestoreSaleRequest) (RestoreSaleResponse, error) {
	if request.ReservationID == "" || request.IdempotencyKey == "" {
		return RestoreSaleResponse{}, ErrInvalidRequest
	}

	return s.store.RestoreSale(request)
}

func (s *Service) ValidateReservation(request ValidateReservationRequest) (ValidateReservationResponse, error) {
	reservation, ok := s.store.FindByID(request.ReservationID)

	if !ok || reservation.QuoteID != request.QuoteID {
		return ValidateReservationResponse{
			Valid:  false,
			Status: StatusExpired,
		}, nil
	}

	valid := reservation.Status == StatusActive && sameItems(reservation.Items, request.Items)

	return ValidateReservationResponse{
		Valid:  valid,
		Status: reservation.Status,
	}, nil
}

func (s *Service) ReleaseReservation(request ReleaseReservationRequest) (ReleaseReservationResponse, error) {
	reservation, ok := s.store.FindByID(request.ReservationID)

	if !ok || reservation.QuoteID != request.QuoteID {
		return ReleaseReservationResponse{}, ErrReservationNotFound
	}

	if reservation.Status == StatusActive {
		reservation.Status = StatusReleased
		if err := s.store.Save(reservation); err != nil {
			return ReleaseReservationResponse{}, err
		}
	}

	return ReleaseReservationResponse{
		ReservationID: reservation.ID,
		Status:        reservation.Status,
	}, nil
}

func (s *Service) ConsumeOrderCreated(event OrderCreatedEvent) error {
	if event.EventID == "" || event.Payload.ReservationID == "" {
		return ErrInvalidRequest
	}

	reservation, ok := s.store.FindByID(event.Payload.ReservationID)
	if !ok {
		return ErrReservationNotFound
	}

	if _, processed := reservation.ProcessedEvent[event.EventID]; processed {
		return nil
	}
	if reservation.ProcessedEvent == nil {
		reservation.ProcessedEvent = map[string]time.Time{}
	}

	if reservation.Status == StatusSold {
		reservation.ProcessedEvent[event.EventID] = time.Now()
		return s.store.Save(reservation)
	}

	// A canceled or expired hold has already been reconciled by the authority; a
	// delayed or redelivered sale event must be acknowledged, not requeued forever.
	if reservation.Status == StatusReleased || reservation.Status == StatusExpired {
		reservation.ProcessedEvent[event.EventID] = time.Now()
		return s.store.Save(reservation)
	}

	if reservation.Status != StatusActive || reservation.QuoteID != event.Payload.QuoteID {
		return ErrReservationUnavailable
	}
	if !sameItems(reservation.Items, event.Payload.Items) {
		return ErrReservationUnavailable
	}

	reservation.Status = StatusSold
	reservation.ProcessedEvent[event.EventID] = time.Now()
	return s.store.Save(reservation)
}

func restrictRestoreTargets(reservation Reservation, request RestoreSaleRequest) ([]Item, bool) {
	if len(request.Items) == 0 {
		return reservation.Items, true
	}

	reservedItems := sortItemsByStockPoolID(reservation.Items)
	targets := make([]Item, 0, len(reservedItems))
	for _, requested := range request.Items {
		remaining := requested.Quantity
		if remaining <= 0 {
			for _, candidate := range reservedItems {
				if candidate.InventoryID == requested.InventoryID &&
					(requested.StockPoolID == "" || candidate.StockPoolID == requested.StockPoolID) {
					remaining += candidate.Quantity
				}
			}
		}

		for _, candidate := range reservedItems {
			if candidate.InventoryID != requested.InventoryID ||
				(requested.StockPoolID != "" && candidate.StockPoolID != requested.StockPoolID) {
				continue
			}

			quantity := min(candidate.Quantity, remaining)
			if quantity <= 0 {
				continue
			}
			target := candidate
			target.Quantity = quantity
			targets = append(targets, target)
			remaining -= quantity
		}

		if remaining != 0 {
			return nil, false
		}
	}

	return targets, true
}

func sameItems(left []Item, right []Item) bool {
	compareByPool := false
	for _, item := range right {
		if item.StockPoolID != "" {
			compareByPool = true
			break
		}
	}

	quantities := map[string]int{}
	key := func(item Item) string {
		if compareByPool {
			return item.InventoryID + "\x00" + item.StockPoolID
		}
		return item.InventoryID
	}
	for _, item := range left {
		quantities[key(item)] += item.Quantity
	}
	for _, item := range right {
		quantities[key(item)] -= item.Quantity
	}
	for _, quantity := range quantities {
		if quantity != 0 {
			return false
		}
	}

	return true
}

func sortItemsByInventoryID(items []Item) []Item {
	sorted := slices.Clone(items)

	slices.SortFunc(sorted, func(left Item, right Item) int {
		if left.InventoryID < right.InventoryID {
			return -1
		}
		if left.InventoryID > right.InventoryID {
			return 1
		}
		return 0
	})
	return sorted
}

func sortItemsByStockPoolID(items []Item) []Item {
	sorted := slices.Clone(items)

	slices.SortFunc(sorted, func(left Item, right Item) int {
		if left.StockPoolID < right.StockPoolID {
			return -1
		}
		if left.StockPoolID > right.StockPoolID {
			return 1
		}
		return 0
	})
	return sorted
}

func newID() string {
	var bytes [16]byte

	if _, err := rand.Read(bytes[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))
	}

	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	return hex.EncodeToString(bytes[0:4]) + "-" +
		hex.EncodeToString(bytes[4:6]) + "-" +
		hex.EncodeToString(bytes[6:8]) + "-" +
		hex.EncodeToString(bytes[8:10]) + "-" +
		hex.EncodeToString(bytes[10:16])
}
