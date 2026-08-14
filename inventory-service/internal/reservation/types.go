package reservation

import "time"

type Status string

const (
	StatusActive   Status = "ACTIVE"
	StatusSold     Status = "SOLD"
	StatusExpired  Status = "EXPIRED"
	StatusReleased Status = "RELEASED"
)

type Item struct {
	InventoryID               string `json:"inventoryId"`
	Quantity                  int    `json:"quantity"`
	Title                     string `json:"title,omitempty"`
	AvailableAfterReservation int    `json:"-"`
}

type Reservation struct {
	ID             string
	QuoteID        string
	CartID         string
	Status         Status
	Items          []Item
	ExpiresAt      time.Time
	IdempotencyKey string
	ProcessedEvent map[string]time.Time
}

type ReserveQuoteRequest struct {
	QuoteID        string    `json:"quoteId"`
	CartID         string    `json:"cartId"`
	IdempotencyKey string    `json:"idempotencyKey"`
	ExpiresAt      time.Time `json:"expiresAt"`
	Items          []Item    `json:"items"`
}

type ReserveQuoteResponse struct {
	ReservationID string `json:"reservationId"`
	Status        Status `json:"status"`
	Items         []struct {
		InventoryID               string `json:"inventoryId"`
		Quantity                  int    `json:"quantity"`
		AvailableAfterReservation int    `json:"availableAfterReservation"`
	} `json:"items"`
}

type ValidateReservationRequest struct {
	QuoteID       string `json:"quoteId"`
	ReservationID string `json:"reservationId"`
	Items         []Item `json:"items"`
}

type ValidateReservationResponse struct {
	Valid  bool   `json:"valid"`
	Status Status `json:"status"`
}

type ReleaseReservationRequest struct {
	QuoteID        string `json:"quoteId"`
	ReservationID  string `json:"reservationId"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type ReleaseReservationResponse struct {
	ReservationID string `json:"reservationId"`
	Status        Status `json:"status"`
}

type OrderCreatedEvent struct {
	EventID    string    `json:"eventId"`
	EventType  string    `json:"eventType"`
	OccurredAt time.Time `json:"occurredAt"`
	Producer   string    `json:"producer"`
	Payload    struct {
		OrderIDs      []string `json:"orderIds"`
		QuoteID       string   `json:"quoteId"`
		ReservationID string   `json:"reservationId"`
		Items         []Item   `json:"items"`
	} `json:"payload"`
}
