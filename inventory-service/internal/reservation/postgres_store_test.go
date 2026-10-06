package reservation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// These tests exercise the remote authority against real PostgreSQL, because the
// memory store cannot prove locking, idempotency, or race safety. They are skipped
// unless DATABASE_URL points at a PostgreSQL server the test may create schemas in.
func newPostgresStoreHarness(t *testing.T) (*PostgresStore, *pgxpool.Pool) {
	t.Helper()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not set; skipping PostgreSQL store tests")
	}

	ctx := context.Background()
	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect admin pool: %v", err)
	}
	if err := admin.Ping(ctx); err != nil {
		admin.Close()
		t.Fatalf("ping admin pool: %v", err)
	}

	schema := fmt.Sprintf("reservation_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, fmt.Sprintf(`create schema "%s"`, schema)); err != nil {
		admin.Close()
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), fmt.Sprintf(`drop schema "%s" cascade`, schema))
		admin.Close()
	})

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse database url: %v", err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatalf("connect schema pool: %v", err)
	}
	t.Cleanup(pool.Close)

	applyReservationSchema(t, pool)

	return NewPostgresStore(pool), pool
}

func applyReservationSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	statements := []string{
		`create table shops (id uuid primary key)`,
		`create table products (id uuid primary key)`,
		`create table product_variants (id uuid primary key)`,
		`create table product_inventory (
			id uuid primary key,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			shop_id uuid not null references shops(id),
			product_id uuid not null references products(id),
			product_variant_id uuid not null references product_variants(id),
			on_hand_quantity int not null default 0,
			reserved_quantity int not null default 0,
			on_hand_version int not null default 1,
			stock int not null default 0,
			lifecycle_state text not null default 'active'
		)`,
		`create table product_stock_pool (
			id uuid primary key,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			inventory_id uuid not null references product_inventory(id),
			on_hand_quantity int not null default 0,
			reserved_quantity int not null default 0,
			on_hand_version int not null default 1,
			stock int not null default 0,
			lifecycle_state text not null default 'active',
			is_default boolean not null default false
		)`,
		`create table inventory_movements (
			id uuid primary key,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			inventory_id uuid not null references product_inventory(id),
			stock_pool_id uuid not null references product_stock_pool(id),
			movement_kind varchar(50) not null,
			quantity_delta int not null,
			on_hand_before int not null,
			reserved_before int not null,
			on_hand_after int not null,
			reserved_after int not null,
			cause varchar(100) not null,
			actor_id varchar(255),
			command_id varchar(255),
			note text
		)`,
		`create unique index inventory_movements_command_pool_kind_unique
			on inventory_movements (command_id, stock_pool_id, movement_kind) where command_id is not null`,
		`create table inventory_reservations (
			id uuid primary key,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			order_id uuid not null,
			cart_id varchar(255) not null,
			status varchar(20) not null,
			expires_at timestamptz not null,
			idempotency_key varchar(255) not null
		)`,
		`create unique index inventory_reservations_idempotency_key_unique on inventory_reservations (idempotency_key)`,
		`create unique index inventory_reservations_order_id_unique on inventory_reservations (order_id)`,
		`create table inventory_reservation_items (
			reservation_id uuid not null references inventory_reservations(id) on delete cascade,
			inventory_id uuid not null references product_inventory(id),
			stock_pool_id uuid not null references product_stock_pool(id),
			quantity int not null,
			title varchar(255),
			primary key (reservation_id, stock_pool_id)
		)`,
		`create table inventory_processed_events (
			event_id varchar(255) primary key,
			reservation_id uuid not null references inventory_reservations(id) on delete cascade,
			processed_at timestamptz not null
		)`,
		// Production maintains the derived `product_inventory` aggregate with a
		// trigger on the pools, so the authority writes no balance columns itself.
		// The harness declares the same trigger to keep the test schema honest.
		`create function product_stock_pool_mirror_inventory_aggregate()
		returns trigger
		language plpgsql
		as $$
		begin
			update product_inventory
			set on_hand_quantity = aggregate.on_hand_quantity,
			    reserved_quantity = aggregate.reserved_quantity,
			    on_hand_version = aggregate.on_hand_version,
			    stock = greatest(aggregate.on_hand_quantity - aggregate.reserved_quantity, 0),
			    updated_at = now()
			from (
				select coalesce(sum(on_hand_quantity), 0) as on_hand_quantity,
				       coalesce(sum(reserved_quantity), 0) as reserved_quantity,
				       coalesce(max(on_hand_version), 1) as on_hand_version
				from product_stock_pool
				where inventory_id = new.inventory_id
			) aggregate
			where product_inventory.id = new.inventory_id;

			return null;
		end;
		$$`,
		`create trigger product_stock_pool_mirror_inventory_aggregate
		after insert or update of on_hand_quantity, reserved_quantity, on_hand_version
		on product_stock_pool
		for each row
		execute function product_stock_pool_mirror_inventory_aggregate()`,
	}

	ctx := context.Background()
	for _, statement := range statements {
		if _, err := pool.Exec(ctx, statement); err != nil {
			t.Fatalf("apply schema statement %q: %v", statement, err)
		}
	}
}

func seedStockPool(t *testing.T, pool *pgxpool.Pool, onHand int) (string, string) {
	t.Helper()

	ctx := context.Background()
	var shopID, productID, variantID, inventoryID, poolID string

	err := pool.QueryRow(ctx, `insert into shops (id) values (gen_random_uuid()) returning id`).Scan(&shopID)
	if err != nil {
		t.Fatalf("seed shop: %v", err)
	}
	if err := pool.QueryRow(ctx, `insert into products (id) values (gen_random_uuid()) returning id`).Scan(&productID); err != nil {
		t.Fatalf("seed product: %v", err)
	}
	if err := pool.QueryRow(ctx, `insert into product_variants (id) values (gen_random_uuid()) returning id`).Scan(&variantID); err != nil {
		t.Fatalf("seed variant: %v", err)
	}
	err = pool.QueryRow(
		ctx,
		`insert into product_inventory (id, shop_id, product_id, product_variant_id, on_hand_quantity, stock)
		 values (gen_random_uuid(), $1, $2, $3, $4, $4) returning id`,
		shopID, productID, variantID, onHand,
	).Scan(&inventoryID)
	if err != nil {
		t.Fatalf("seed inventory: %v", err)
	}
	err = pool.QueryRow(
		ctx,
		`insert into product_stock_pool (id, inventory_id, on_hand_quantity, reserved_quantity, on_hand_version, stock, is_default)
		 values (gen_random_uuid(), $1, $2, 0, 1, $2, true) returning id`,
		inventoryID, onHand,
	).Scan(&poolID)
	if err != nil {
		t.Fatalf("seed pool: %v", err)
	}

	return inventoryID, poolID
}

func newTestOrderID(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	var id string
	if err := pool.QueryRow(context.Background(), `select gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("generate order id: %v", err)
	}
	return id
}

func TestPostgresStoreReserveConsumeRestore(t *testing.T) {
	store, pool := newPostgresStoreHarness(t)
	service := NewService(store)
	inventoryID, poolID := seedStockPool(t, pool, 3)
	orderID := newTestOrderID(t, pool)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        orderID,
		CartID:         "cart-1",
		IdempotencyKey: orderID + ":reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{{InventoryID: inventoryID, StockPoolID: poolID, Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("reserve order: %v", err)
	}

	assertPoolState(t, pool, poolID, 3, 1, 1)

	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-1",
		EventType: "order.created",
		Payload:   orderCreatedPayloadForTest(orderID, reserved.ReservationID, inventoryID, poolID, 1),
	}); err != nil {
		t.Fatalf("consume order created: %v", err)
	}
	assertPoolState(t, pool, poolID, 2, 0, 1)

	first, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "restore-1",
	})
	if err != nil {
		t.Fatalf("restore sale: %v", err)
	}
	if !first.Restored {
		t.Fatal("expected the sold reservation to be restored")
	}
	assertPoolState(t, pool, poolID, 3, 0, 1)

	if _, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "restore-1",
	}); err != nil {
		t.Fatalf("replayed restore sale: %v", err)
	}
	assertPoolState(t, pool, poolID, 3, 0, 1)

	var corrections int
	err = pool.QueryRow(
		context.Background(),
		`select count(*) from inventory_movements where stock_pool_id = $1 and movement_kind = 'correction'`,
		poolID,
	).Scan(&corrections)
	if err != nil {
		t.Fatalf("count corrections: %v", err)
	}
	if corrections != 1 {
		t.Fatalf("expected exactly one correction movement, got %d", corrections)
	}
}

func orderCreatedPayloadForTest(orderID string, reservationID string, inventoryID string, poolID string, quantity int) struct {
	OrderIDs      []string `json:"orderIds"`
	ReservationID string   `json:"reservationId"`
	Items         []Item   `json:"items"`
} {
	return struct {
		OrderIDs      []string `json:"orderIds"`
		ReservationID string   `json:"reservationId"`
		Items         []Item   `json:"items"`
	}{
		OrderIDs:      []string{orderID},
		ReservationID: reservationID,
		Items:         []Item{{InventoryID: inventoryID, StockPoolID: poolID, Quantity: quantity}},
	}
}

func assertPoolState(t *testing.T, pool *pgxpool.Pool, poolID string, onHand int, reserved int, version int) {
	t.Helper()

	var onHandQuantity, reservedQuantity, onHandVersion int
	err := pool.QueryRow(
		context.Background(),
		`select on_hand_quantity, reserved_quantity, on_hand_version from product_stock_pool where id = $1`,
		poolID,
	).Scan(&onHandQuantity, &reservedQuantity, &onHandVersion)
	if err != nil {
		t.Fatalf("read pool: %v", err)
	}
	if onHandQuantity != onHand || reservedQuantity != reserved || onHandVersion != version {
		t.Fatalf(
			"expected on-hand=%d reserved=%d version=%d, got %d/%d/%d",
			onHand, reserved, version, onHandQuantity, reservedQuantity, onHandVersion,
		)
	}
}

func TestPostgresStoreCountWritesPoolAndReportsConflict(t *testing.T) {
	store, pool := newPostgresStoreHarness(t)
	service := NewService(store)
	inventoryID, poolID := seedStockPool(t, pool, 5)

	response, err := service.SetOnHandQuantity(SetOnHandQuantityRequest{
		InventoryID:           inventoryID,
		StockPoolID:           poolID,
		ExpectedOnHandVersion: 1,
		OnHandQuantity:        4,
		IdempotencyKey:        "count-1",
		ActorID:               "seller-1",
	})
	if err != nil {
		t.Fatalf("set on-hand: %v", err)
	}
	if response.StockPoolID != poolID || response.OnHandQuantity != 4 || response.OnHandVersion != 2 {
		t.Fatalf("unexpected count response: %+v", response)
	}
	assertPoolState(t, pool, poolID, 4, 0, 2)

	conflict, err := service.SetOnHandQuantity(SetOnHandQuantityRequest{
		InventoryID:           inventoryID,
		StockPoolID:           poolID,
		ExpectedOnHandVersion: 1,
		OnHandQuantity:        9,
		IdempotencyKey:        "count-2",
	})
	if !errors.Is(err, ErrOnHandVersionConflict) {
		t.Fatalf("expected on-hand version conflict, got %v", err)
	}
	if conflict.StockPoolID != poolID || conflict.OnHandVersion != 2 || conflict.OnHandQuantity != 4 {
		t.Fatalf("expected the conflict to report the current pool balance, got %+v", conflict)
	}

	// The database maintains the derived `product_inventory` aggregate from the
	// pools, so a count applied here still lands in the aggregate the local
	// authority reads.
	var aggregateOnHand int
	if err := pool.QueryRow(
		context.Background(),
		`select on_hand_quantity from product_inventory where id = $1`,
		inventoryID,
	).Scan(&aggregateOnHand); err != nil {
		t.Fatalf("read aggregate: %v", err)
	}
	if aggregateOnHand != 4 {
		t.Fatalf("expected the aggregate to mirror the pool at 4, got %d", aggregateOnHand)
	}
}

func TestPostgresStoreConcurrentReserveKeepsOneWinner(t *testing.T) {
	store, pool := newPostgresStoreHarness(t)
	service := NewService(store)
	inventoryID, poolID := seedStockPool(t, pool, 1)
	orderID1 := newTestOrderID(t, pool)
	orderID2 := newTestOrderID(t, pool)

	var waitGroup sync.WaitGroup
	results := make([]error, 2)
	waitGroup.Add(2)
	for index := range results {
		go func(index int) {
			defer waitGroup.Done()
			orderID := orderID1
			if index == 1 {
				orderID = orderID2
			}
			_, err := service.ReserveQuote(ReserveQuoteRequest{
				OrderID:        orderID,
				CartID:         fmt.Sprintf("cart-%d", index),
				IdempotencyKey: fmt.Sprintf("%s:reservation:v1", orderID),
				ExpiresAt:      time.Now().Add(30 * time.Minute),
				Items:          []Item{{InventoryID: inventoryID, StockPoolID: poolID, Quantity: 1}},
			})
			results[index] = err
		}(index)
	}
	waitGroup.Wait()

	succeeded := 0
	for _, err := range results {
		if err == nil {
			succeeded++
			continue
		}
		if !errors.Is(err, ErrReservationUnavailable) && !errors.Is(err, ErrIdempotencyConflict) {
			t.Fatalf("unexpected reserve error: %v", err)
		}
	}
	if succeeded != 1 {
		t.Fatalf("expected exactly one successful reservation, got %d", succeeded)
	}
	assertPoolState(t, pool, poolID, 1, 1, 1)
}

func TestPostgresStoreOrderOwnedReservationRoundTrip(t *testing.T) {
	store, pool := newPostgresStoreHarness(t)
	service := NewService(store)
	inventoryID, poolID := seedStockPool(t, pool, 5)
	ctx := context.Background()

	orderID1 := newTestOrderID(t, pool)
	orderID2 := newTestOrderID(t, pool)

	first, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        orderID1,
		CartID:         "cart-order-1",
		IdempotencyKey: fmt.Sprintf("%s:reservation:v1", orderID1),
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{{InventoryID: inventoryID, StockPoolID: poolID, Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("reserve order-owned: %v", err)
	}

	storedFirst, ok := store.FindByID(first.ReservationID)
	if !ok {
		t.Fatalf("expected to find first reservation by id")
	}
	if storedFirst.OrderID != orderID1 {
		t.Fatalf("expected OrderID %q, got %q", orderID1, storedFirst.OrderID)
	}

	var storedOrderID string
	err = pool.QueryRow(
		ctx,
		`select order_id::text from inventory_reservations where id = $1`,
		first.ReservationID,
	).Scan(&storedOrderID)
	if err != nil {
		t.Fatalf("read stored order-owned row: %v", err)
	}
	if storedOrderID != orderID1 {
		t.Fatalf("expected stored order_id %q, got %q", orderID1, storedOrderID)
	}

	second, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        orderID2,
		CartID:         "cart-order-2",
		IdempotencyKey: fmt.Sprintf("%s:reservation:v1", orderID2),
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{{InventoryID: inventoryID, StockPoolID: poolID, Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("reserve second order-owned: %v", err)
	}

	storedSecond, ok := store.FindByID(second.ReservationID)
	if !ok {
		t.Fatalf("expected to find second reservation by id")
	}
	if storedSecond.OrderID != orderID2 {
		t.Fatalf("expected second OrderID %q, got %q", orderID2, storedSecond.OrderID)
	}

	var orderOwnedCount int
	err = pool.QueryRow(
		ctx,
		`select count(*) from inventory_reservations where order_id is not null`,
	).Scan(&orderOwnedCount)
	if err != nil {
		t.Fatalf("count order-owned rows: %v", err)
	}
	if orderOwnedCount != 2 {
		t.Fatalf("expected 2 order-owned rows, got %d", orderOwnedCount)
	}

	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-match",
		EventType: "order.created",
		Payload:   orderCreatedPayloadForTest(orderID1, first.ReservationID, inventoryID, poolID, 1),
	}); err != nil {
		t.Fatalf("consume matching order: %v", err)
	}

	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-mismatch",
		EventType: "order.created",
		Payload:   orderCreatedPayloadForTest(newTestOrderID(t, pool), second.ReservationID, inventoryID, poolID, 1),
	}); !errors.Is(err, ErrReservationUnavailable) {
		t.Fatalf("expected unavailable reservation for mismatched order id, got %v", err)
	}

	storedSecond, _ = store.FindByID(second.ReservationID)
	if storedSecond.Status != StatusActive {
		t.Fatalf("expected mismatched reservation to stay active, got %s", storedSecond.Status)
	}

	assertPoolState(t, pool, poolID, 4, 1, 1)
}
