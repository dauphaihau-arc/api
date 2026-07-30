#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
seed_dir="$repo_root/seed-data"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

has_leaks=0

extract_column() {
  local source_path="$1"
  local column_name="$2"
  local output_path="$3"

  if [ ! -f "$source_path" ]; then
    : > "$output_path"
    return
  fi

  awk -F '\t' -v column_name="$column_name" '
    NR == 1 {
      for (i = 1; i <= NF; i++) {
        if ($i == column_name) {
          column_index = i
          break
        }
      }
      if (!column_index) {
        exit 1
      }
      next
    }
    column_index && $column_index != "" {
      print $column_index
    }
  ' "$source_path" | sort -u > "$output_path"
}

extract_product_pairs() {
  local source_path="$1"
  local output_path="$2"

  if [ ! -f "$source_path" ]; then
    : > "$output_path"
    return
  fi

  awk -F '\t' '
    NR == 1 {
      for (i = 1; i <= NF; i++) {
        if ($i == "shop_slug") shop_slug_column = i
        if ($i == "title") title_column = i
      }
      if (!shop_slug_column || !title_column) {
        exit 1
      }
      next
    }
    $shop_slug_column != "" && $title_column != "" {
      print $shop_slug_column "\t" $title_column
    }
  ' "$source_path" | sort -u > "$output_path"
}

scan_values_in_columns() {
  local values_path="$1"
  local label="$2"
  local columns_csv="$3"
  local found_leaks=0

  if [ ! -s "$values_path" ]; then
    return
  fi

  while IFS= read -r seed_file; do
    if ! leaks="$(
      awk -F '\t' \
        -v values_path="$values_path" \
        -v label="$label" \
        -v columns_csv="$columns_csv" '
        BEGIN {
          while ((getline value < values_path) > 0) {
            protected_values[value] = 1
          }
          split(columns_csv, wanted_columns, ",")
        }
        FNR == 1 {
          delete scanned_columns
          for (i = 1; i <= NF; i++) {
            header_columns[$i] = i
          }
          for (i in wanted_columns) {
            column_name = wanted_columns[i]
            if (column_name in header_columns) {
              scanned_columns[header_columns[column_name]] = column_name
            }
          }
          delete header_columns
          next
        }
        {
          for (column_index in scanned_columns) {
            value = $column_index
            if (value in protected_values) {
              print FILENAME ":" FNR ":" label " " value " in " scanned_columns[column_index] ":" $0
            }
          }
        }
      ' "$seed_file"
    )"; then
      echo "Failed to scan $seed_file." >&2
      exit 1
    fi

    if [ -n "$leaks" ]; then
      found_leaks=1
      printf '%s\n' "$leaks"
    fi
  done < <(find "$seed_dir" -maxdepth 1 -type f -name '*.tsv' ! -name '*.local.tsv' | sort)

  if [ "$found_leaks" -ne 0 ]; then
    has_leaks=1
  fi
}

scan_product_pairs() {
  local product_pairs_path="$1"
  local found_leaks=0

  if [ ! -s "$product_pairs_path" ]; then
    return
  fi

  while IFS= read -r seed_file; do
  if ! leaks="$(
    awk -F '\t' -v pairs_path="$product_pairs_path" '
      BEGIN {
        while ((getline pair < pairs_path) > 0) {
          local_product_pairs[pair] = 1
        }
      }
      FNR == 1 {
        for (i = 1; i <= NF; i++) {
          if ($i == "shop_slug") shop_slug_column = i
          if ($i == "product_title") product_title_column = i
          if ($i == "title") title_column = i
        }
        next
      }
      {
        product_column = product_title_column ? product_title_column : title_column
        if (shop_slug_column && product_column) {
          pair = $shop_slug_column "\t" $product_column
          if (pair in local_product_pairs) {
            print FILENAME ":" FNR ":local product " $shop_slug_column " / " $product_column ":" $0
          }
        }
      }
    ' "$seed_file"
  )"; then
    echo "Failed to scan $seed_file." >&2
    exit 1
  fi

  if [ -n "$leaks" ]; then
    found_leaks=1
    printf '%s\n' "$leaks"
  fi
done < <(find "$seed_dir" -maxdepth 1 -type f -name '*.tsv' ! -name '*.local.tsv' | sort)

  if [ "$found_leaks" -ne 0 ]; then
    has_leaks=1
  fi
}

local_emails_file="$tmp_dir/local-auth-user-emails"
local_shop_slugs_file="$tmp_dir/local-shop-slugs"
local_product_pairs_file="$tmp_dir/local-product-pairs"

extract_column "$seed_dir/auth-users.local.tsv" "email" "$local_emails_file"
extract_column "$seed_dir/shops.local.tsv" "shop_slug" "$local_shop_slugs_file"
extract_product_pairs "$seed_dir/products.local.tsv" "$local_product_pairs_file"

scan_values_in_columns "$local_emails_file" "local auth-user email" "email,user_email,buyer_email,sender_email,owner_email"
scan_values_in_columns "$local_shop_slugs_file" "local shop slug" "shop_slug"
scan_product_pairs "$local_product_pairs_file"

if [ "$has_leaks" -ne 0 ]; then
  echo "Local-only seed identities must not appear in non-local seed TSV files." >&2
  exit 1
fi

echo "No local-only auth-user emails, shop slugs, or products found in non-local seed TSV files."
