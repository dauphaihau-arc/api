package reservation

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const uniqueViolationCode = "23505"

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

func (s *PostgresStore) Close() {
	s.pool.Close()
}

func (s *PostgresStore) CreateReservation(reservation Reservation) (Reservation, error) {
	ctx := context.Background()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return Reservation{}, err
	}
	defer tx.Rollback(ctx)

	existing, ok, err := findByIdempotencyKey(ctx, tx, reservation.IdempotencyKey)
	if err != nil {
		return Reservation{}, err
	}
	if ok {
		if sameReservation(existing, reservation) {
			return existing, nil
		}
		return Reservation{}, ErrIdempotencyConflict
	}

	existing, ok, err = findByQuoteID(ctx, tx, reservation.QuoteID)
	if err != nil {
		return Reservation{}, err
	}
	if ok {
		if sameReservation(existing, reservation) {
			return existing, nil
		}
		return Reservation{}, ErrIdempotencyConflict
	}

	availableAfterReservationByInventoryID := map[string]int{}

	for _, item := range sortItemsByInventoryID(reservation.Items) {
		var onHandQuantity int
		var reservedQuantity int
		var lifecycleState string

		err := tx.QueryRow(
			ctx,
			`
				select on_hand_quantity, reserved_quantity, lifecycle_state
				from product_inventory
				where id = $1
				for update
			`,
			item.InventoryID,
		).Scan(&onHandQuantity, &reservedQuantity, &lifecycleState)

		if errors.Is(err, pgx.ErrNoRows) {
			return Reservation{}, ErrReservationUnavailable
		}
		if err != nil {
			return Reservation{}, err
		}
		if lifecycleState == string(LifecycleRemoved) || onHandQuantity-reservedQuantity < item.Quantity {
			return Reservation{}, ErrReservationUnavailable
		}

		beforeReservedQuantity := reservedQuantity
		reservedQuantity += item.Quantity
		availableAfterReservation := onHandQuantity - reservedQuantity
		if availableAfterReservation < 0 {
			availableAfterReservation = 0
		}
		_, err = tx.Exec(
			ctx,
			`
				update product_inventory
				set reserved_quantity = $1,
				    stock = greatest(on_hand_quantity - $1, 0),
				    updated_at = now()
				where id = $2
			`,
			reservedQuantity,
			item.InventoryID,
		)

		if err != nil {
			return Reservation{}, err
		}

		_, err = tx.Exec(
			ctx,
			`
				insert into inventory_movements (
					id, created_at, updated_at, inventory_id, movement_kind, quantity_delta,
					on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
				)
				values (gen_random_uuid(), now(), now(), $1, 'reserve', $2, $3, $4, $3, $5, 'checkout_quote', $6)
				on conflict (command_id, inventory_id, movement_kind) do nothing
			`,
			item.InventoryID,
			item.Quantity,
			onHandQuantity,
			beforeReservedQuantity,
			reservedQuantity,
			reservation.IdempotencyKey,
		)
		if err != nil {
			return Reservation{}, err
		}

		availableAfterReservationByInventoryID[item.InventoryID] = availableAfterReservation
	}

	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_reservations (
				id,
				created_at,
				updated_at,
				quote_id,
				cart_id,
				status,
				expires_at,
				idempotency_key
			)
			values ($1, now(), now(), $2, $3, $4, $5, $6)
		`,
		reservation.ID,
		reservation.QuoteID,
		reservation.CartID,
		reservation.Status,
		reservation.ExpiresAt,
		reservation.IdempotencyKey,
	)
	if isUniqueViolation(err) {
		return Reservation{}, ErrIdempotencyConflict
	}
	if err != nil {
		return Reservation{}, err
	}

	itemRows := make([][]any, 0, len(reservation.Items))
	for _, item := range reservation.Items {
		itemRows = append(itemRows, []any{
			reservation.ID,
			item.InventoryID,
			item.Quantity,
			item.Title,
		})
	}

	if len(itemRows) > 0 {
		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"inventory_reservation_items"},
			[]string{"reservation_id", "inventory_id", "quantity", "title"},
			pgx.CopyFromRows(itemRows),
		)
		if err != nil {
			return Reservation{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Reservation{}, err
	}

	reservation.ProcessedEvent = map[string]time.Time{}

	for index := range reservation.Items {
		inventoryID := reservation.Items[index].InventoryID
		reservation.Items[index].AvailableAfterReservation = availableAfterReservationByInventoryID[inventoryID]
	}

	return reservation, nil
}

func (s *PostgresStore) FindByID(id string) (Reservation, bool) {
	reservation, ok, err := findByID(context.Background(), s.pool, id)
	if err != nil {
		return Reservation{}, false
	}
	return reservation, ok
}

func (s *PostgresStore) FindByIdempotencyKey(key string) (Reservation, bool) {
	reservation, ok, err := findByIdempotencyKey(context.Background(), s.pool, key)
	if err != nil {
		return Reservation{}, false
	}
	return reservation, ok
}

func (s *PostgresStore) Save(reservation Reservation) error {
	ctx := context.Background()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	current, ok, err := findByIDForUpdate(ctx, tx, reservation.ID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrReservationNotFound
	}

	shouldUpdateStatus := true
	if reservation.Status == StatusReleased || reservation.Status == StatusExpired {
		switch current.Status {
		case StatusActive:
			for _, item := range current.Items {
				if err := releaseReservedQuantity(ctx, tx, item, reservation); err != nil {
					return err
				}
			}
		case StatusReleased, StatusExpired:
			shouldUpdateStatus = false
		default:
			return ErrReservationUnavailable
		}
	}
	if reservation.Status == StatusSold {
		if current.Status == StatusSold {
			shouldUpdateStatus = false
		} else if current.Status != StatusActive {
			return ErrReservationUnavailable
		} else {
			if err := validateConsumeReservedQuantities(ctx, tx, current.Items); err != nil {
				return err
			}
			for _, item := range current.Items {
				if err := consumeReservedQuantity(ctx, tx, item, reservation); err != nil {
					return err
				}
			}
		}
	}

	if shouldUpdateStatus {
		_, err = tx.Exec(
			ctx,
			`
				update inventory_reservations
				set status = $1, updated_at = now()
				where id = $2
			`,
			reservation.Status,
			reservation.ID,
		)
		if err != nil {
			return err
		}
	}

	for eventID, processedAt := range reservation.ProcessedEvent {
		_, err = tx.Exec(
			ctx,
			`
				insert into inventory_processed_events (event_id, reservation_id, processed_at)
				values ($1, $2, $3)
				on conflict (event_id) do nothing
			`,
			eventID,
			reservation.ID,
			processedAt,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *PostgresStore) SetOnHandQuantity(request SetOnHandQuantityRequest) (InventoryBalance, error) {
	ctx := context.Background()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return InventoryBalance{}, err
	}
	defer tx.Rollback(ctx)

	var before InventoryBalance
	err = tx.QueryRow(
		ctx,
		`
			select on_hand_quantity, reserved_quantity, on_hand_version, lifecycle_state
			from product_inventory
			where id = $1
			for update
		`,
		request.InventoryID,
	).Scan(
		&before.OnHandQuantity,
		&before.ReservedQuantity,
		&before.OnHandVersion,
		&before.LifecycleState,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return InventoryBalance{}, ErrInventoryNotFound
	}
	if err != nil {
		return InventoryBalance{}, err
	}
	if before.OnHandVersion != request.ExpectedOnHandVersion {
		return before.withDerivedQuantities(), ErrOnHandVersionConflict
	}

	after := before
	after.OnHandQuantity = request.OnHandQuantity
	after.OnHandVersion++
	_, err = tx.Exec(
		ctx,
		`
			update product_inventory
			set on_hand_quantity = $1,
			    on_hand_version = $2,
			    stock = greatest($1 - reserved_quantity, 0),
			    updated_at = now()
			where id = $3
		`,
		after.OnHandQuantity,
		after.OnHandVersion,
		request.InventoryID,
	)
	if err != nil {
		return InventoryBalance{}, err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after,
				cause, actor_id, command_id, note
			)
			values (gen_random_uuid(), now(), now(), $1, 'count', $2, $3, $4, $5, $4, 'seller_count', $6, $7, nullif($8, ''))
			on conflict (command_id, inventory_id, movement_kind) do nothing
		`,
		request.InventoryID,
		after.OnHandQuantity-before.OnHandQuantity,
		before.OnHandQuantity,
		before.ReservedQuantity,
		after.OnHandQuantity,
		request.ActorID,
		request.IdempotencyKey,
		request.Note,
	)
	if err != nil {
		return InventoryBalance{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return InventoryBalance{}, err
	}

	return after.withDerivedQuantities(), nil
}

func releaseReservedQuantity(ctx context.Context, tx pgx.Tx, item Item, reservation Reservation) error {
	var onHandQuantity int
	var reservedQuantity int
	err := tx.QueryRow(
		ctx,
		`
			update product_inventory
			set reserved_quantity = greatest(reserved_quantity - $1, 0),
			    stock = greatest(on_hand_quantity - greatest(reserved_quantity - $1, 0), 0),
			    updated_at = now()
			where id = $2
			returning on_hand_quantity, reserved_quantity
		`,
		item.Quantity,
		item.InventoryID,
	).Scan(&onHandQuantity, &reservedQuantity)
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
			)
			values (gen_random_uuid(), now(), now(), $1, 'release', $2, $3, $4, $3, $5, $6, $7)
			on conflict (command_id, inventory_id, movement_kind) do nothing
		`,
		item.InventoryID,
		item.Quantity,
		onHandQuantity,
		reservedQuantity+item.Quantity,
		reservedQuantity,
		string(reservation.Status),
		reservation.IdempotencyKey,
	)
	return err
}

func validateConsumeReservedQuantities(ctx context.Context, tx pgx.Tx, items []Item) error {
	for _, item := range sortItemsByInventoryID(items) {
		var onHandQuantity int
		var reservedQuantity int
		err := tx.QueryRow(
			ctx,
			`
				select on_hand_quantity, reserved_quantity
				from product_inventory
				where id = $1
				for update
			`,
			item.InventoryID,
		).Scan(&onHandQuantity, &reservedQuantity)
		if err != nil {
			return err
		}
		if onHandQuantity < item.Quantity || reservedQuantity < item.Quantity {
			return ErrReservationUnavailable
		}
	}
	return nil
}

func consumeReservedQuantity(ctx context.Context, tx pgx.Tx, item Item, reservation Reservation) error {
	var onHandQuantity int
	var reservedQuantity int
	err := tx.QueryRow(
		ctx,
		`
			update product_inventory
			set on_hand_quantity = on_hand_quantity - $1,
			    reserved_quantity = reserved_quantity - $1,
			    stock = greatest((on_hand_quantity - $1) - (reserved_quantity - $1), 0),
			    updated_at = now()
			where id = $2
			returning on_hand_quantity, reserved_quantity
		`,
		item.Quantity,
		item.InventoryID,
	).Scan(&onHandQuantity, &reservedQuantity)
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
			)
			values (gen_random_uuid(), now(), now(), $1, 'sale', $2, $3, $4, $5, $6, 'order_created', $7)
			on conflict (command_id, inventory_id, movement_kind) do nothing
		`,
		item.InventoryID,
		-item.Quantity,
		onHandQuantity+item.Quantity,
		reservedQuantity+item.Quantity,
		onHandQuantity,
		reservedQuantity,
		reservation.IdempotencyKey,
	)
	return err
}

func findByID(ctx context.Context, querier pgxQuerier, id string) (Reservation, bool, error) {
	return findOne(ctx, querier, `where reservation.id = $1`, "", id)
}

func findByIDForUpdate(ctx context.Context, querier pgxQuerier, id string) (Reservation, bool, error) {
	return findOne(ctx, querier, `where reservation.id = $1`, `for update of reservation`, id)
}

func findByQuoteID(ctx context.Context, querier pgxQuerier, quoteID string) (Reservation, bool, error) {
	return findOne(ctx, querier, `where reservation.quote_id = $1`, "", quoteID)
}

func findByIdempotencyKey(ctx context.Context, querier pgxQuerier, key string) (Reservation, bool, error) {
	return findOne(ctx, querier, `where reservation.idempotency_key = $1`, "", key)
}

func findOne(ctx context.Context, querier pgxQuerier, where string, lockClause string, value string) (Reservation, bool, error) {
	rows, err := querier.Query(
		ctx,
		`
			select
				reservation.id::text,
				reservation.quote_id,
				reservation.cart_id,
				reservation.status,
				reservation.expires_at,
				reservation.idempotency_key,
				item.inventory_id::text,
				item.quantity,
				coalesce(item.title, ''),
				event.event_id,
				event.processed_at
			from inventory_reservations reservation
			left join inventory_reservation_items item
				on item.reservation_id = reservation.id
			left join inventory_processed_events event
				on event.reservation_id = reservation.id
			`+where+`
			order by item.inventory_id
			`+lockClause+`
		`,
		value,
	)
	if err != nil {
		return Reservation{}, false, err
	}
	defer rows.Close()

	var reservation Reservation
	itemByInventoryID := map[string]Item{}
	processedEvents := map[string]time.Time{}
	found := false

	for rows.Next() {
		found = true
		var itemInventoryID *string
		var itemQuantity *int
		var itemTitle *string
		var eventID *string
		var processedAt *time.Time

		if err := rows.Scan(
			&reservation.ID,
			&reservation.QuoteID,
			&reservation.CartID,
			&reservation.Status,
			&reservation.ExpiresAt,
			&reservation.IdempotencyKey,
			&itemInventoryID,
			&itemQuantity,
			&itemTitle,
			&eventID,
			&processedAt,
		); err != nil {
			return Reservation{}, false, err
		}

		if itemInventoryID != nil && itemQuantity != nil {
			itemByInventoryID[*itemInventoryID] = Item{
				InventoryID: *itemInventoryID,
				Quantity:    *itemQuantity,
				Title:       stringValue(itemTitle),
			}
		}
		if eventID != nil && processedAt != nil {
			processedEvents[*eventID] = *processedAt
		}
	}
	if err := rows.Err(); err != nil {
		return Reservation{}, false, err
	}
	if !found {
		return Reservation{}, false, nil
	}

	for _, item := range sortItemsByInventoryID(mapValues(itemByInventoryID)) {
		reservation.Items = append(reservation.Items, item)
	}
	reservation.ProcessedEvent = processedEvents

	return reservation, true, nil
}

type pgxQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == uniqueViolationCode
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func mapValues(values map[string]Item) []Item {
	items := make([]Item, 0, len(values))
	for _, item := range values {
		items = append(items, item)
	}
	return items
}
