package reservation

import (
	"errors"
	"sync"
)

var (
	ErrReservationNotFound = errors.New("reservation not found")
	ErrIdempotencyConflict = errors.New("idempotency key conflict")
)

type Store interface {
	CreateReservation(reservation Reservation) (Reservation, error)
	FindByID(id string) (Reservation, bool)
	FindByIdempotencyKey(key string) (Reservation, bool)
	Save(reservation Reservation) error
}

type MemoryStore struct {
	mu               sync.Mutex
	byID             map[string]Reservation
	byIdempotencyKey map[string]string
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byID:             map[string]Reservation{},
		byIdempotencyKey: map[string]string{},
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

	s.byID[reservation.ID] = reservation
	s.byIdempotencyKey[reservation.IdempotencyKey] = reservation.ID

	return reservation, nil
}

func (s *MemoryStore) FindByID(id string) (Reservation, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	reservation, ok := s.byID[id]
	return reservation, ok
}

func (s *MemoryStore) FindByIdempotencyKey(key string) (Reservation, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, ok := s.byIdempotencyKey[key]
	if !ok {
		return Reservation{}, false
	}

	reservation, ok := s.byID[id]
	return reservation, ok
}

func (s *MemoryStore) Save(reservation Reservation) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.byID[reservation.ID] = reservation
	if reservation.IdempotencyKey != "" {
		s.byIdempotencyKey[reservation.IdempotencyKey] = reservation.ID
	}
	return nil
}

func sameReservation(left Reservation, right Reservation) bool {
	return left.QuoteID == right.QuoteID &&
		left.CartID == right.CartID &&
		sameItems(left.Items, right.Items)
}
