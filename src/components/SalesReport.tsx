import { Fragment, useEffect, useState } from "react";
import { api, downloadApi, type SalesReport } from "../api";
import { formatSek } from "../format";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const MONTHS = [
  "Januari",
  "Februari",
  "Mars",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "Augusti",
  "September",
  "Oktober",
  "November",
  "December",
];

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: ymd(start), to: ymd(end) };
}

function calendarMonth(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { from: ymd(start), to: ymd(end) };
}

function yearRange(year = new Date().getFullYear()) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function sameRange(a: { from: string; to: string }, b: { from: string; to: string }) {
  return a.from === b.from && a.to === b.to;
}

function isFullMonth(from: string, to: string) {
  const [year, month] = from.split("-").map(Number);
  if (!year || !month) return false;
  return sameRange({ from, to }, calendarMonth(year, month - 1));
}

export default function SalesReportPanel() {
  const initial = monthRange(0);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (nextFrom = from, nextTo = to) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<SalesReport>(`/api/admin/report?from=${nextFrom}&to=${nextTo}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta rapport");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const applyRange = (next: { from: string; to: string }) => {
    setFrom(next.from);
    setTo(next.to);
    void load(next.from, next.to);
  };

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  const fromParts = from.split("-").map(Number);
  const selectedYear = fromParts[0] || thisYear;
  const selectedMonth = (fromParts[1] || 1) - 1;
  const monthSelectValue = sameRange({ from, to }, yearRange(selectedYear))
    ? "year"
    : isFullMonth(from, to)
      ? String(selectedMonth)
      : "custom";
  const preset = sameRange({ from, to }, monthRange(0))
    ? "this-month"
    : sameRange({ from, to }, monthRange(-1))
      ? "last-month"
      : sameRange({ from, to }, yearRange(selectedYear))
        ? "year"
        : "custom";

  return (
    <section className="report">
      <h1>Försäljningsrapport</h1>
      <p>
        Välj period på datorn. Siffrorna visar antal sålda artiklar och summa. Köp som tagits bort under Köp räknas inte med.
      </p>

      <div className="report-toolbar">
        <div className="report-presets" role="group" aria-label="Snabbval">
          <button type="button" className={preset === "this-month" ? "on" : ""} onClick={() => applyRange(monthRange(0))}>
            Denna månad
          </button>
          <button type="button" className={preset === "last-month" ? "on" : ""} onClick={() => applyRange(monthRange(-1))}>
            Förra månaden
          </button>
          <button type="button" className={preset === "year" ? "on" : ""} onClick={() => applyRange(yearRange())}>
            I år
          </button>
        </div>

        <div className="report-range">
          <label className="field">
            År
            <select
              value={selectedYear}
              onChange={(e) => {
                const year = Number(e.target.value);
                if (monthSelectValue === "year") applyRange(yearRange(year));
                else applyRange(calendarMonth(year, selectedMonth));
              }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Månad
            <select
              value={monthSelectValue}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "year") applyRange(yearRange(selectedYear));
                else if (value !== "custom") applyRange(calendarMonth(selectedYear, Number(value)));
              }}
            >
              <option value="year">Helår</option>
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
              {monthSelectValue === "custom" ? <option value="custom">Valfri period</option> : null}
            </select>
          </label>
          <label className="field">
            Från
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            Till
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="report-apply" onClick={() => void load()}>
            Visa
          </button>
        </div>

        <div className="report-export">
          <span>Exportera</span>
          <button
            type="button"
            onClick={() => void downloadApi(`/api/admin/report?from=${from}&to=${to}&format=csv`, `forsaljning-${from}-${to}.csv`)}
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => void downloadApi(`/api/admin/report?from=${from}&to=${to}&format=pdf`, `forsaljning-${from}-${to}.pdf`)}
          >
            PDF
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Hämtar rapport…</p> : null}

      {report ? (
        <>
          <div className="report-summary">
            <div>
              <span>Period</span>
              <strong>
                {report.from} – {report.to}
              </strong>
            </div>
            <div>
              <span>Köp</span>
              <strong>{report.orderCount}</strong>
            </div>
            <div>
              <span>Sålda artiklar</span>
              <strong>{report.itemCount}</strong>
            </div>
            <div>
              <span>Totalsumma</span>
              <strong>{formatSek(report.totalAmount)}</strong>
            </div>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th>Kategori / produkt</th>
                <th className="num">Antal</th>
                <th className="num">Summa</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((category) => (
                <Fragment key={category.category}>
                  <tr className="report-cat">
                    <th scope="row">{category.category}</th>
                    <td className="num">{category.qty}</td>
                    <td className="num">{formatSek(category.amount)}</td>
                  </tr>
                  {category.products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td className="num">{product.qty}</td>
                      <td className="num">{formatSek(product.amount)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Totalt</th>
                <td className="num">{report.itemCount}</td>
                <td className="num">{formatSek(report.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      ) : null}
    </section>
  );
}
