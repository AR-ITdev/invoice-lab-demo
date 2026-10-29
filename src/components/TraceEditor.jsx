import { useState } from "react";
import { COL, TRACE_COLUMNS } from "../lib/proposal.js";

export default function TraceEditor({ preview, overrides = {}, disabled, onOverride, onReset }) {
  const [onlyFilled, setOnlyFilled] = useState(true);
  const rows = preview.rows;
  const isOverridden = (slot, index) => overrides[slot]?.[index] !== undefined;
  const visible = TRACE_COLUMNS.filter((column) => !onlyFilled || rows.some((row) => row.values[column.index - 1] !== "" || isOverridden(row.id, column.index)));
  const edited = rows.reduce((sum, row) => sum + Object.keys(overrides[row.id] ?? {}).length, 0);
  return <section aria-label="Tracciato di registrazione">
    <div className="trace-tools">
      <label><input type="checkbox" checked={onlyFilled} onChange={(event) => setOnlyFilled(event.target.checked)} />Solo colonne valorizzate ({visible.length} di {TRACE_COLUMNS.length})</label>
      <button type="button" className="secondary-button" disabled={disabled || !edited} onClick={onReset}>Ripristina valori calcolati{edited ? ` (${edited})` : ""}</button>
    </div>
    <p className="info-banner">Ogni cella è calcolata dalle regole di colonna. Le forzature restano evidenziate e vengono ricontrollate: importi e IVA devono coincidere con la proposta riconciliata, anche se il saldo resta zero.</p>
    <div className="trace-table-scroll" style={{ marginTop: 10 }}><table className="trace-table"><thead><tr><th>Col.</th><th>Campo</th>
      {rows.map((row, index) => <th key={row.id}>{index + 1}. {row.label}</th>)}</tr></thead>
      <tbody>{visible.map((column) => <tr key={column.index} className={column.index === COL.text ? "highlight" : ""}>
        <th><b>{column.letter}</b></th><th>{column.label}<small>{column.mode}</small></th>
        {rows.map((row) => <td key={row.id} className={isOverridden(row.id, column.index) ? "overridden" : ""}>
          <input aria-label={`${column.letter} ${column.label} — ${row.label}`} value={row.values[column.index - 1]} disabled={disabled}
            onChange={(event) => onOverride(row.id, column.index, event.target.value)} /></td>)}
      </tr>)}</tbody></table></div>
  </section>;
}
