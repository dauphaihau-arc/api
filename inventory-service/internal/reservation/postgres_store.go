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

	existing, ok, err = findByOrderID(ctx, tx, reservation.OrderID)
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

	for index := range reservation.Items {
		item := &reservation.Items[index]

		poolID, err := resolveStockPoolID(ctx, tx, item.InventoryID, item.StockPoolID)
		if errors.Is(err, pgx.ErrNoRows) {
			return Reservation{}, ErrReservationUnavailable
		}
		if err != nil {
			return Reservation{}, err
		}
		item.StockPoolID = poolID

		var onHandQuantity int
		var reservedQuantity int
		var lifecycleState string

		err = tx.QueryRow(
			ctx,
			`
				select on_hand_quantity, reserved_quantity, lifecycle_state
				from product_stock_pool
				where id = $1
				for update
			`,
			poolID,
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
				update product_stock_pool
				set reserved_quantity = $1,
				    stock = greatest(on_hand_quantity - $1, 0),
				    updated_at = now()
				where id = $2
			`,
			reservedQuantity,
			poolID,
		)
		if err != nil {
			return Reservation{}, err
		}

		_, err = tx.Exec(
			ctx,
			`
				insert into inventory_movements (
					id, created_at, updated_at, inventory_id, stock_pool_id, movement_kind, quantity_delta,
					on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
				)
				values (gen_random_uuid(), now(), now(), $1, $2, 'reserve', $3, $4, $5, $4, $6, 'checkout_quote', $7)
				on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
			`,
			item.InventoryID,
			poolID,
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
				order_id,
				cart_id,
				status,
				expires_at,
				idempotency_key
			)
			values ($1, now(), now(), $2, $3, $4, $5, $6)
		`,
		reservation.ID,
		reservation.OrderID,
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
			item.StockPoolID,
			item.Quantity,
			item.Title,
		})
	}

	if len(itemRows) > 0 {
		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"inventory_reservation_items"},
			[]string{"reservation_id", "inventory_id", "stock_pool_id", "quantity", "title"},
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

	poolID, err := resolveStockPoolID(ctx, tx, request.InventoryID, request.StockPoolID)
	if errors.Is(err, pgx.ErrNoRows) {
		return InventoryBalance{}, ErrStockPoolNotFound
	}
	if err != nil {
		return InventoryBalance{}, err
	}

	var before InventoryBalance
	err = tx.QueryRow(
		ctx,
		`
			select inventory_id, on_hand_quantity, reserved_quantity, on_hand_version, lifecycle_state, is_default
			from product_stock_pool
			where id = $1
			for update
		`,
		poolID,
	).Scan(
		&before.InventoryID,
		&before.OnHandQuantity,
		&before.ReservedQuantity,
		&before.OnHandVersion,
		&before.LifecycleState,
		&before.IsDefault,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return InventoryBalance{}, ErrStockPoolNotFound
	}
	if err != nil {
		return InventoryBalance{}, err
	}
	if before.InventoryID != request.InventoryID {
		return InventoryBalance{}, ErrStockPoolNotFound
	}
	before.StockPoolID = poolID
	if before.OnHandVersion != request.ExpectedOnHandVersion {
		return before.withDerivedQuantities(), ErrOnHandVersionConflict
	}

	after := before
	after.OnHandQuantity = request.OnHandQuantity
	after.OnHandVersion++
	_, err = tx.Exec(
		ctx,
		`
			update product_stock_pool
			set on_hand_quantity = $1,
			    on_hand_version = $2,
			    stock = greatest($1 - reserved_quantity, 0),
			    updated_at = now()
			where id = $3
		`,
		after.OnHandQuantity,
		after.OnHandVersion,
		poolID,
	)
	if err != nil {
		return InventoryBalance{}, err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, stock_pool_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after,
				cause, actor_id, command_id, note
			)
			values (gen_random_uuid(), now(), now(), $1, $2, 'count', $3, $4, $5, $6, $5, 'seller_count', $7, $8, nullif($9, ''))
			on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
		`,
		request.InventoryID,
		poolID,
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

func (s *PostgresStore) RestoreSale(request RestoreSaleRequest) (RestoreSaleResponse, error) {
	ctx := context.Background()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return RestoreSaleResponse{}, err
	}
	defer tx.Rollback(ctx)

	reservation, ok, err := findByIDForUpdate(ctx, tx, request.ReservationID)
	if err != nil {
		return RestoreSaleResponse{}, err
	}
	if !ok {
		return RestoreSaleResponse{}, ErrReservationNotFound
	}

	var claimed bool
	err = tx.QueryRow(
		ctx,
		`
			insert into inventory_processed_events (event_id, reservation_id, processed_at)
			values ($1, $2, now())
			on conflict (event_id) do nothing
			returning true
		`,
		request.IdempotencyKey,
		reservation.ID,
	).Scan(&claimed)
	if errors.Is(err, pgx.ErrNoRows) {
		// Replay: the restoration for this command already ran.
		if err := tx.Commit(ctx); err != nil {
			return RestoreSaleResponse{}, err
		}
		return RestoreSaleResponse{ReservationID: reservation.ID, Restored: true}, nil
	}
	if err != nil {
		return RestoreSaleResponse{}, err
	}

	targets, ok := restrictRestoreTargets(reservation, request)
	if !ok {
		return RestoreSaleResponse{}, ErrReservationUnavailable
	}

	restored := false
	switch reservation.Status {
	case StatusActive:
		for _, item := range targets {
			if err := releaseReservedQuantity(ctx, tx, item, Reservation{Status: StatusReleased, IdempotencyKey: request.IdempotencyKey}); err != nil {
				return RestoreSaleResponse{}, err
			}
		}
		if len(targets) == len(reservation.Items) {
			_, err = tx.Exec(
				ctx,
				`update inventory_reservations set status = $1, updated_at = now() where id = $2`,
				StatusReleased,
				reservation.ID,
			)
			if err != nil {
				return RestoreSaleResponse{}, err
			}
		}
	case StatusSold:
		for _, item := range targets {
			if err := restoreSoldQuantity(ctx, tx, item, request); err != nil {
				return RestoreSaleResponse{}, err
			}
		}
		restored = true
	case StatusReleased, StatusExpired:
		if err := tx.Commit(ctx); err != nil {
			return RestoreSaleResponse{}, err
		}
		return RestoreSaleResponse{ReservationID: reservation.ID, Restored: false}, nil
	}

	if err := tx.Commit(ctx); err != nil {
		return RestoreSaleResponse{}, err
	}

	return RestoreSaleResponse{ReservationID: reservation.ID, Restored: restored}, nil
}

func resolveStockPoolID(ctx context.Context, tx pgx.Tx, inventoryID string, requestedPoolID string) (string, error) {
	if requestedPoolID != "" {
		var resolved string
		err := tx.QueryRow(
			ctx,
			`
				select id
				from product_stock_pool
				where id = $1 and inventory_id = $2
			`,
			requestedPoolID,
			inventoryID,
		).Scan(&resolved)
		return resolved, err
	}

	var poolID string
	err := tx.QueryRow(
		ctx,
		`
			select id
			from product_stock_pool
			where inventory_id = $1 and is_default = true
		`,
		inventoryID,
	).Scan(&poolID)
	return poolID, err
}

func ensureItemStockPool(ctx context.Context, tx pgx.Tx, item Item) (Item, error) {
	if item.StockPoolID != "" {
		return item, nil
	}

	poolID, err := resolveStockPoolID(ctx, tx, item.InventoryID, "")
	if err != nil {
		return Item{}, ErrStockPoolNotFound
	}
	item.StockPoolID = poolID
	return item, nil
}

func releaseReservedQuantity(ctx context.Context, tx pgx.Tx, item Item, reservation Reservation) error {
	item, err := ensureItemStockPool(ctx, tx, item)
	if err != nil {
		return err
	}

	var onHandQuantity int
	var reservedQuantity int
	err = tx.QueryRow(
		ctx,
		`
			update product_stock_pool
			set reserved_quantity = greatest(reserved_quantity - $1, 0),
			    stock = greatest(on_hand_quantity - greatest(reserved_quantity - $1, 0), 0),
			    updated_at = now()
			where id = $2
			returning on_hand_quantity, reserved_quantity
		`,
		item.Quantity,
		item.StockPoolID,
	).Scan(&onHandQuantity, &reservedQuantity)
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, stock_pool_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
			)
			values (gen_random_uuid(), now(), now(), $1, $2, 'release', $3, $4, $5, $4, $6, $7, $8)
			on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
		`,
		item.InventoryID,
		item.StockPoolID,
		item.Quantity,
		onHandQuantity,
		reservedQuantity+item.Quantity,
		reservedQuantity,
		string(reservation.Status),
		reservation.IdempotencyKey,
	)
	return err
}

func restoreSoldQuantity(ctx context.Context, tx pgx.Tx, item Item, request RestoreSaleRequest) error {
	item, err := ensureItemStockPool(ctx, tx, item)
	if err != nil {
		return err
	}

	var onHandQuantity int
	var reservedQuantity int
	err = tx.QueryRow(
		ctx,
		`
			update product_stock_pool
			set on_hand_quantity = on_hand_quantity + $1,
			    stock = greatest((on_hand_quantity + $1) - reserved_quantity, 0),
			    updated_at = now()
			where id = $2
			returning on_hand_quantity, reserved_quantity
		`,
		item.Quantity,
		item.StockPoolID,
	).Scan(&onHandQuantity, &reservedQuantity)
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, stock_pool_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
			)
			values (gen_random_uuid(), now(), now(), $1, $2, 'correction', $3, $4, $5, $6, $5, $7, $8)
			on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
		`,
		item.InventoryID,
		item.StockPoolID,
		item.Quantity,
		onHandQuantity-item.Quantity,
		reservedQuantity,
		onHandQuantity,
		request.Reason,
		request.IdempotencyKey,
	)
	return err
}

func validateConsumeReservedQuantities(ctx context.Context, tx pgx.Tx, items []Item) error {
	for _, item := range sortItemsByStockPoolID(items) {
		item, err := ensureItemStockPool(ctx, tx, item)
		if err != nil {
			return err
		}

		var onHandQuantity int
		var reservedQuantity int
		err = tx.QueryRow(
			ctx,
			`
				select on_hand_quantity, reserved_quantity
				from product_stock_pool
				where id = $1
				for update
			`,
			item.StockPoolID,
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
	item, err := ensureItemStockPool(ctx, tx, item)
	if err != nil {
		return err
	}

	var onHandQuantity int
	var reservedQuantity int
	err = tx.QueryRow(
		ctx,
		`
			update product_stock_pool
			set on_hand_quantity = on_hand_quantity - $1,
			    reserved_quantity = reserved_quantity - $1,
			    stock = greatest((on_hand_quantity - $1) - (reserved_quantity - $1), 0),
			    updated_at = now()
			where id = $2
			returning on_hand_quantity, reserved_quantity
		`,
		item.Quantity,
		item.StockPoolID,
	).Scan(&onHandQuantity, &reservedQuantity)
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		ctx,
		`
			insert into inventory_movements (
				id, created_at, updated_at, inventory_id, stock_pool_id, movement_kind, quantity_delta,
				on_hand_before, reserved_before, on_hand_after, reserved_after, cause, command_id
			)
			values (gen_random_uuid(), now(), now(), $1, $2, 'sale', $3, $4, $5, $6, $7, 'order_created', $8)
			on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
		`,
		item.InventoryID,
		item.StockPoolID,
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

func findByOrderID(ctx context.Context, querier pgxQuerier, orderID string) (Reservation, bool, error) {
	return findOne(ctx, querier, `where reservation.order_id = $1`, "", orderID)
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
				reservation.order_id::text,
				reservation.cart_id,
				reservation.status,
				reservation.expires_at,
				reservation.idempotency_key,
				item.inventory_id::text,
				item.stock_pool_id::text,
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
			order by item.stock_pool_id
			`+lockClause+`
		`,
		value,
	)
	if err != nil {
		return Reservation{}, false, err
	}
	defer rows.Close()

	var reservation Reservation
	itemByStockPoolID := map[string]Item{}
	processedEvents := map[string]time.Time{}
	found := false

	for rows.Next() {
		found = true
		var id string
		var orderID string
		var cartID string
		var status string
		var expiresAt time.Time
		var idempotencyKey string
		var itemInventoryID *string
		var itemStockPoolID *string
		var itemQuantity *int
		var itemTitle *string
		var eventID *string
		var processedAt *time.Time

		if err := rows.Scan(
			&id,
			&orderID,
			&cartID,
			&status,
			&expiresAt,
			&idempotencyKey,
			&itemInventoryID,
			&itemStockPoolID,
			&itemQuantity,
			&itemTitle,
			&eventID,
			&processedAt,
		); err != nil {
			return Reservation{}, false, err
		}

		reservation = Reservation{
			ID:             id,
			OrderID:        orderID,
			CartID:         cartID,
			Status:         Status(status),
			ExpiresAt:      expiresAt,
			IdempotencyKey: idempotencyKey,
		}

		if itemInventoryID != nil && itemQuantity != nil {
			stockPoolID := ""
			if itemStockPoolID != nil {
				stockPoolID = *itemStockPoolID
			}
			itemByStockPoolID[stockPoolID] = Item{
				InventoryID: *itemInventoryID,
				StockPoolID: stockPoolID,
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

	for _, item := range sortItemsByStockPoolID(mapItemValues(itemByStockPoolID)) {
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

func mapItemValues(values map[string]Item) []Item {
	items := make([]Item, 0, len(values))
	for _, item := range values {
		items = append(items, item)
	}
	return items
}
