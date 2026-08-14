FROM golang:1.23-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/inventory-service ./cmd/inventory-service

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/inventory-service /app/inventory-service
EXPOSE 8080
ENTRYPOINT ["/app/inventory-service"]
