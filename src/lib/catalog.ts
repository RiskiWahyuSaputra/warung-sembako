"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import { errorMessage } from "./format";
import { PRODUCT_COLUMNS, type Category, type Product } from "./types";

/** Memuat semua barang beserta satuan jualnya, dan kategori. */
export function useCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const [p, c] = await Promise.all([
        sb.from("products").select(`${PRODUCT_COLUMNS}, product_units(*)`).order("name"),
        sb.from("categories").select("id, name").order("name"),
      ]);
      if (cancelled) return;
      if (p.error || c.error) {
        setError(errorMessage(p.error ?? c.error));
      } else {
        setError(null);
        setProducts(
          (p.data as Product[]).map((x) => ({
            ...x,
            stock: Number(x.stock),
            min_stock: Number(x.min_stock),
            product_units: (x.product_units ?? [])
              .map((u) => ({ ...u, price: Number(u.price), conversion: Number(u.conversion) }))
              .sort((a, b) => a.conversion - b.conversion),
          })),
        );
        setCategories(c.data as Category[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { products, categories, loading, error, reload };
}

export const isLowStock = (p: Product) => p.stock <= p.min_stock;
