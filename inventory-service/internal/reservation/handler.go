package reservation

import (
	"encoding/json"
	"errors"
	"net/http"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.health)
	mux.HandleFunc("POST /inventory/reservations/quote", h.reserveQuote)
	mux.HandleFunc("POST /inventory/reservations/validate", h.validateReservation)
	mux.HandleFunc("POST /inventory/reservations/release", h.releaseReservation)
	return mux
}

func (h *Handler) health(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) reserveQuote(writer http.ResponseWriter, request *http.Request) {
	var body ReserveQuoteRequest

	if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
		writeError(writer, http.StatusBadRequest, "INVALID_JSON", err.Error())
		return
	}

	response, err := h.service.ReserveQuote(body)

	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrIdempotencyConflict) {
			status = http.StatusConflict
		}
		writeError(writer, status, "RESERVATION_FAILED", err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, response)
}

func (h *Handler) validateReservation(writer http.ResponseWriter, request *http.Request) {
	var body ValidateReservationRequest

	if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
		writeError(writer, http.StatusBadRequest, "INVALID_JSON", err.Error())
		return
	}

	response, err := h.service.ValidateReservation(body)

	if err != nil {
		writeError(writer, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func (h *Handler) releaseReservation(writer http.ResponseWriter, request *http.Request) {
	var body ReleaseReservationRequest

	if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
		writeError(writer, http.StatusBadRequest, "INVALID_JSON", err.Error())
		return
	}

	response, err := h.service.ReleaseReservation(body)

	if err != nil {
		writeError(writer, http.StatusNotFound, "RESERVATION_NOT_FOUND", err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, response)
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeError(writer http.ResponseWriter, status int, code string, message string) {
	writeJSON(writer, status, map[string]string{
		"code":    code,
		"message": message,
	})
}
