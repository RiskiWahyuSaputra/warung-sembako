export type Role = "owner" | "kasir";

export type Profile = { id: string; full_name: string; role: Role };

export type Category = { id: string; name: string };

export type ProductUnit = {
  id: string;
  product_id: string;
  name: string;
  conversion: number;
  price: number;
  barcode: string | null;
  returns_product_id: string | null;
  is_default: boolean;
};

/** Kolom yang boleh dibaca semua pengguna (harga modal tidak termasuk). */
export const PRODUCT_COLUMNS =
  "id, name, category_id, base_unit, allow_decimal, stock, min_stock, is_active, image_path, created_at";

export type Product = {
  id: string;
  name: string;
  category_id: string | null;
  base_unit: string;
  allow_decimal: boolean;
  stock: number;
  min_stock: number;
  is_active: boolean;
  /** Path foto di bucket storage "product-images", null jika belum ada foto. */
  image_path: string | null;
  created_at: string;
  product_units?: ProductUnit[];
};

export type Customer = { id: string; name: string; phone: string | null; debt_balance: number; created_at: string };

export type SaleStatus = "pending" | "paid" | "cancelled" | "expired";
export type PaymentMethod = "cash" | "qris" | "kasbon";

export type Sale = {
  id: string;
  invoice_no: string;
  status: SaleStatus;
  payment_method: PaymentMethod;
  total: number;
  cash_received: number | null;
  change_amount: number | null;
  customer_id: string | null;
  midtrans_order_id: string | null;
  qr_url: string | null;
  cashier_id: string | null;
  created_at: string;
  paid_at: string | null;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_name: string;
  unit_name: string;
  qty: number;
  price: number;
  subtotal: number;
};

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Tunai", qris: "QRIS", kasbon: "Kasbon" };
export const STATUS_LABEL: Record<SaleStatus, string> = {
  pending: "Menunggu bayar",
  paid: "Lunas",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};
