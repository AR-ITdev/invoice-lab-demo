import { useState } from "react";
import {
  RULE_DATE_FORMATS, RULE_FIELDS, RULE_OPERATORS, ROW_RULE_SCOPES, VALUELESS_OPERATORS, independentRowRules,
  evaluateColumnRule, ruleContext, validateColumnRule,
} from "../lib/columnRules.js";

const standardParts = () => [{ type: "data", key: "default.value" }];
const newCondition = () => ({ key: "row.documentKind", operator: "equals", value: "Nota di credito" });
const replaceAt = (items, index, value) => items.map((item, position) => position === index ? value : item);
const move = (items, index, delta) => {
  const result = [...items];
  [result[index], result[index + delta]] = [result[index + delta], result[index]];
  return result;
};

function DataField({ value, onChange, label }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    {RULE_FIELDS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
  </select>;
}

function Parts({ value, onChange, label }) {
  return <div className="rule-parts" role="group" aria-label={label}>
    {value.map((part, index) => {
      const set = (patch) => onChange(replaceAt(value, index, { ...part, ...patch }));
      const name = `${label}, parte ${index + 1}`;
      return <div className="rule-part" key={index}>
        <select aria-label={`${name}, tipo`} value={part.type} onChange={(event) =>
          onChange(replaceAt(value, index, event.target.value === "text" ? { type: "text", value: "" } : { type: "data", key: "xml.number" }))}>
          <option value="text">Testo</option><option value="data">Dato</option>
        </select>
        {part.type === "text" ? <input aria-label={`${name}, testo`} value={part.value} onChange={(event) => set({ value: event.target.value })} />
          : <>
            <DataField label={`${name}, fonte`} value={part.key} onChange={(key) => onChange(replaceAt(value, index, { type: "data", key }))} />
            {RULE_FIELDS.find(([key]) => key === part.key)?.[2] === "date" && <select aria-label={`${name}, formato data`}
              value={part.format ?? ""} onChange={(event) => set({ format: event.target.value })}>
              {RULE_DATE_FORMATS.map(([format, title]) => <option key={format} value={format}>{title}</option>)}</select>}
            <input type="number" min="1" max="30" aria-label={`${name}, cifre minime`} placeholder="Cifre minime"
              value={part.width ?? ""} onChange={(event) => set({ width: event.target.value })} />
          </>}
        <button type="button" className="secondary-button" aria-label={`${name}, sposta prima`} disabled={index === 0} onClick={() => onChange(move(value, index, -1))}>↑</button>
        <button type="button" className="secondary-button" aria-label={`${name}, sposta dopo`} disabled={index === value.length - 1} onClick={() => onChange(move(value, index, 1))}>↓</button>
        <button type="button" className="secondary-button" aria-label={`${name}, rimuovi`} onClick={() => onChange(value.filter((_, position) => position !== index))}>Rimuovi</button>
      </div>;
    })}
    {!value.length && <p className="muted">Risultato vuoto.</p>}
    <div className="association-actions">
      <button type="button" className="secondary-button" onClick={() => onChange([...value, { type: "text", value: "" }])}>Aggiungi testo</button>
      <button type="button" className="secondary-button" onClick={() => onChange([...value, { type: "data", key: "xml.number" }])}>Aggiungi dato</button>
      {[" ", "/", "-", "_"].map((separator) => <button type="button" className="secondary-button" key={separator}
        onClick={() => onChange([...value, { type: "text", value: separator }])}>{separator === " " ? "+ Spazio" : `+ ${separator}`}</button>)}
    </div>
  </div>;
}

function Cases({ rule, onChange }) {
  const updateCase = (index, entry) => onChange({ ...rule, cases: replaceAt(rule.cases, index, entry) });
  return <>
    <p className="muted">I casi si valutano dall'alto: vince il primo in cui tutte le condizioni sono vere (AND). Per alternative (OR), aggiungi un caso.</p>
    {rule.cases.map((entry, index) => <fieldset className="rule-case" key={index}>
      <legend>Caso {index + 1}</legend>
      <div className="association-actions">
        <button type="button" className="secondary-button" aria-label={`Sposta prima caso ${index + 1}`} disabled={!index}
          onClick={() => onChange({ ...rule, cases: move(rule.cases, index, -1) })}>↑</button>
        <button type="button" className="secondary-button" aria-label={`Sposta dopo caso ${index + 1}`} disabled={index === rule.cases.length - 1}
          onClick={() => onChange({ ...rule, cases: move(rule.cases, index, 1) })}>↓</button>
        <button type="button" className="secondary-button" onClick={() => onChange({ ...rule, cases: rule.cases.filter((_, position) => position !== index) })}>Rimuovi caso {index + 1}</button>
      </div>
      {entry.when.map((condition, position) => {
        const label = `Caso ${index + 1}, condizione ${position + 1}`;
        const set = (patch) => updateCase(index, { ...entry, when: replaceAt(entry.when, position, { ...condition, ...patch }) });
        return <div className="rule-condition" key={position}><span>{position ? "E" : "Se"}</span>
          <DataField label={`${label}, dato`} value={condition.key} onChange={(key) => set({ key })} />
          <select aria-label={`${label}, confronto`} value={condition.operator} onChange={(event) => set({ operator: event.target.value })}>
            {RULE_OPERATORS.map(([operator, title]) => <option key={operator} value={operator}>{title}</option>)}
          </select>
          {!VALUELESS_OPERATORS.has(condition.operator) && <input aria-label={`${label}, valore`} value={condition.value ?? ""} onChange={(event) => set({ value: event.target.value })} />}
          <button type="button" className="secondary-button" aria-label={`${label}, rimuovi`} disabled={entry.when.length === 1}
            onClick={() => updateCase(index, { ...entry, when: entry.when.filter((_, item) => item !== position) })}>Rimuovi</button>
        </div>;
      })}
      <button type="button" className="secondary-button" onClick={() => updateCase(index, { ...entry, when: [...entry.when, newCondition()] })}>Aggiungi condizione AND</button>
      <h4>Allora scrivi</h4>
      <Parts label={`Risultato caso ${index + 1}`} value={entry.parts} onChange={(parts) => updateCase(index, { ...entry, parts })} />
    </fieldset>)}
    <button type="button" className="secondary-button" onClick={() => onChange({ ...rule, cases: [...rule.cases, { when: [newCondition()], parts: standardParts() }] })}>Aggiungi caso</button>
    <h4>Altrimenti scrivi</h4>
    <Parts label="Risultato altrimenti" value={rule.otherwise} onChange={(otherwise) => onChange({ ...rule, otherwise })} />
  </>;
}

export default function ColumnRuleEditor({ column, settings, sample, onSave, onCancel }) {
  const [drafts, setDrafts] = useState(() => independentRowRules(settings));
  const [error, setError] = useState("");
  const update = (scope, next) => { setDrafts((current) => ({ ...current, [scope]: next })); setError(""); };
  function modeChanged(scope, mode) {
    const rule = drafts[scope];
    const parts = rule.parts ?? rule.otherwise ?? standardParts();
    update(scope, mode === "conditional" ? { mode, cases: rule.cases ?? [{ when: [newCondition()], parts: standardParts() }], otherwise: parts }
      : mode === "compose" ? { mode, parts } : { mode });
  }
  function save() {
    try {
      Object.values(drafts).forEach(validateColumnRule);
      if (onSave(drafts)) onCancel();
    } catch (issue) {
      if (!(issue instanceof Error)) throw issue;
      setError(issue.message);
    }
  }
  return <section className="column-rule-editor" aria-label={`Modifica regola ${column.letter}`}>
    <h3>{column.letter} · {column.label}</h3>
    <p>Standard: {column.text}</p>
    <p className="muted">Ogni categoria ha una regola indipendente. Standard mantiene il calcolo iniziale della colonna per quella categoria.</p>
    {ROW_RULE_SCOPES.map(([scope, title]) => {
      const rule = drafts[scope];
      let preview = "Apri un progetto con fatture per vedere un esempio.";
      if (sample) {
        try {
          const row = sample.preview.rows.find((item) => item.slot === scope);
          preview = row ? `${sample.invoice.number} · ${row.label}: «${evaluateColumnRule(rule, ruleContext(row.context, column.value(row.context)))}»`
            : "Categoria assente nella fattura di esempio.";
        } catch (issue) {
          if (!(issue instanceof Error)) throw issue;
          preview = `Anteprima non disponibile: ${issue.message}`;
        }
      }
      return <fieldset className="rule-case" key={scope}>
        <legend>{title}</legend>
        <label className="field"><span>Modalità</span><select aria-label={`${title}, modalità della regola`}
          value={rule.mode} onChange={(event) => modeChanged(scope, event.target.value)}>
          <option value="default">Standard</option><option value="empty">Vuoto</option><option value="compose">Testo e dati</option><option value="conditional">Condizioni</option>
        </select></label>
        {rule.mode === "compose" && <Parts label={`Composizione ${title}`} value={rule.parts} onChange={(parts) => update(scope, { ...rule, parts })} />}
        {rule.mode === "conditional" && <Cases rule={rule} onChange={(next) => update(scope, next)} />}
        <p className="info-banner" aria-live="polite">Anteprima: {preview}</p>
      </fieldset>;
    })}
    {error && <p role="alert" className="warning-banner">{error}</p>}
    <div className="association-actions"><button type="button" className="primary-button" onClick={save}>Salva regola</button>
      <button type="button" className="secondary-button" onClick={onCancel}>Annulla</button></div>
  </section>;
}
