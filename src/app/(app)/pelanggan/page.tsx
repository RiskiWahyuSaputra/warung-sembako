"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Empty, ErrorBox, Loading, Modal, PageHeader } from "@/components/ui";
import { dateTime, errorMessage, parseNumber, rupiah } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Warung Sembako";

/** 0812... / +62812... -> 62812... untuk tautan wa.me */
function waNumber(phone: string | null) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) return `62${d.slice(1)}`;
  if (d.startsWith("62")) return d;
  return d.length >= 8 ? d : null;
}

export default function PelangganPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [debtOnly, setDebtOnly] = useState(true);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabaseBrowser()
      .from("customers")
      .select("*")
      .order("debt_balance", { ascending: false })
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(errorMessage(error));
        else {
          setError(null);
          setCustomers((data as Customer[]).map((c) => ({ ...c, debt_balance: Number(c.debt_balance) })));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (customers ?? []).filter((c) => (!debtOnly || c.debt_balance > 0) && (!q || c.name.toLowerCase().includes(q)));
  }, [customers, search, debtOnly]);

  const outstanding = (customers ?? []).reduce((s, c) => s + c.debt_balance, 0);

  return (
    <>
      <PageHeader title="Kasbon pelanggan">
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Tambah pelanggan
        </button>
      </PageHeader>

      {customers && (
        <p className="mb-4 text-lg">
          Total kasbon belum dibayar: <span className="font-extrabold text-brick">{rupiah(outstanding)}</span>
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_auto]">
        <div>
          <label htmlFor="cari-pel" className="label">
            Cari nama
          </label>
          <input id="cari-pel" type="search" className="field" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end font-semibold">
          <input type="checkbox" className="size-5 accent-green" checked={debtOnly} onChange={(e) => setDebtOnly(e.target.checked)} />
          Hanya yang masih berutang
        </label>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !customers ? (
        <Loading />
      ) : customers.length === 0 ? (
        <Empty title="Belum ada pelanggan">Pelanggan bisa ditambah di sini atau saat memilih bayar Kasbon di kasir.</Empty>
      ) : shown.length === 0 ? (
        <Empty title={debtOnly ? "Tidak ada kasbon yang belum dibayar" : "Tidak ada nama yang cocok"} />
      ) : (
        <ul className="panel divide-y divide-dashed divide-line">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper"
                onClick={() => setSelected(c)}
              >
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{c.name}</span>
                  {c.phone && <span className="block text-sm text-ink-soft">{c.phone}</span>}
                </span>
                <span className={`shrink-0 font-bold ${c.debt_balance > 0 ? "text-brick" : "text-ink-soft"}`}>
                  {c.debt_balance > 0 ? rupiah(c.debt_balance) : "Lunas"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Tambah pelanggan">
        <AddCustomer
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      </Modal>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.name ?? "Pelanggan"} wide>
        {selected && (
          <CustomerDetail
            key={selected.id}
            customer={selected}
            onChanged={(c) => {
              setSelected(c);
              reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function AddCustomer({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Nama wajib diisi.");
    setBusy(true);
    const { error } = await supabaseBrowser().from("customers").insert({ name: name.trim(), phone: phone.trim() || null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="c-name" className="label">
          Nama
        </label>
        <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="c-phone" className="label">
          No. HP / WhatsApp (opsional)
        </label>
        <input id="c-phone" className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {error && <p role="alert" className="font-semibold text-brick">{error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan pelanggan"}
      </button>
    </form>
  );
}

type HistoryRow = { at: string; kind: "utang" | "bayar"; amount: number; label: string };

function CustomerDetail({ customer, onChanged }: { customer: Customer; onChanged: (c: Customer) => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const [s, p] = await Promise.all([
        sb.from("sales").select("invoice_no, total, paid_at").eq("customer_id", customer.id).eq("payment_method", "kasbon").eq("status", "paid"),
        sb.from("debt_payments").select("amount, note, created_at").eq("customer_id", customer.id),
      ]);
      if (cancelled) return;
      if (s.error || p.error) return setError(errorMessage(s.error ?? p.error));
      const list: HistoryRow[] = [
        ...(s.data ?? []).map((x) => ({ at: x.paid_at as string, kind: "utang" as const, amount: Number(x.total), label: x.invoice_no as string })),
        ...(p.data ?? []).map((x) => ({
          at: x.created_at as string,
          kind: "bayar" as const,
          amount: Number(x.amount),
          label: (x.note as string | null) || "Pembayaran",
        })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      setError(null);
      setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [customer.id, version]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setPayError(null);
    const n = parseNumber(amount);
    if (!(n > 0)) return setPayError("Isi nominal pembayaran.");
    if (n > customer.debt_balance) return setPayError("Nominal melebihi sisa kasbon.");
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("pay_debt", { p_customer_id: customer.id, p_amount: n });
    setBusy(false);
    if (error) return setPayError(errorMessage(error));
    setAmount("");
    setVersion((v) => v + 1);
    onChanged({ ...(data as Customer), debt_balance: Number((data as Customer).debt_balance) });
  }

  const wa = waNumber(customer.phone);
  const waText = encodeURIComponent(
    `Halo ${customer.name}, ini dari ${storeName}. Kasbon Anda saat ini ${rupiah(customer.debt_balance)}. Terima kasih.`,
  );

  return (
    <div className="space-y-5">
      <div className="perforated flex flex-wrap items-baseline justify-between gap-2 rounded-lg border-2 p-4">
        <span className="font-semibold">Sisa kasbon</span>
        <span className={`text-3xl font-extrabold ${customer.debt_balance > 0 ? "text-brick" : "text-green"}`}>
          {rupiah(customer.debt_balance)}
        </span>
      </div>

      {customer.debt_balance > 0 && (
        <form onSubmit={pay} className="space-y-2">
          <label htmlFor="pay-amount" className="label">
            Terima pembayaran
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="pay-amount"
              className="field min-w-0 flex-1 basis-40"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button type="button" className="btn btn-ghost" onClick={() => setAmount(String(customer.debt_balance))}>
              Lunasi semua
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan bayar"}
            </button>
          </div>
          {payError && <p role="alert" className="font-semibold text-brick">{payError}</p>}
        </form>
      )}

      {wa && customer.debt_balance > 0 && (
        <a className="btn btn-ghost" href={`https://wa.me/${wa}?text=${waText}`} target="_blank" rel="noopener noreferrer">
          Kirim pengingat WhatsApp
        </a>
      )}

      <section aria-labelledby="riwayat-kasbon">
        <h3 id="riwayat-kasbon" className="mb-2 font-extrabold">
          Riwayat
        </h3>
        {error ? (
          <ErrorBox message={error} onRetry={() => setVersion((v) => v + 1)} />
        ) : !rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-ink-soft">Belum ada kasbon.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-dashed divide-line overflow-y-auto">
            {rows.map((r, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{r.kind === "utang" ? "Belanja kasbon" : "Bayar"}</span>
                  <span className="block text-xs text-ink-soft">
                    {r.label} · {dateTime(r.at)}
                  </span>
                </span>
                <span className={`shrink-0 font-bold ${r.kind === "utang" ? "text-brick" : "text-green"}`}>
                  {r.kind === "utang" ? "+" : "−"}
                  {rupiah(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
