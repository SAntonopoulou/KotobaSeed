import React, { useEffect, useState } from 'react';

// SchemaForm — renders a form from a contentSchema declaration. Used
// by the admin theme editor AND by the tutor page builder when the
// tutor is on a custom theme (so they edit their content with the
// same machinery the designer used to author the variant in the first
// place).
//
// Schema field types:
//   text       — single-line input, optional `max`
//   long-text  — textarea, optional `max`
//   enum       — <select> with `values: string[]`
//   list       — array of items, optional `item` schema. If `item` is
//                an object with field definitions, each item renders
//                its own nested SchemaForm; otherwise items render as
//                primitives.
//   colors     — array of colour swatches with an add/remove control
//
// Each field may declare `required: true` so consumers can render a
// validation hint. Field-level `default` values flow through getValue.
// `hint` is shown below the field as a small caption.

export const FieldRow = ({ label, hint, required, children }) => (
  <label style={{ display: 'block', marginBottom: 10 }}>
    <span style={{
      display: 'block',
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'rgb(var(--kotoba-text-rgb) / 0.6)',
      marginBottom: 4,
    }}>
      {label}
      {required && (
        <span style={{ color: '#dc2626', marginLeft: 4 }} aria-label="required">*</span>
      )}
    </span>
    {children}
    {hint && (
      <span style={{
        display: 'block',
        fontSize: 11,
        color: 'rgb(var(--kotoba-text-rgb) / 0.55)',
        marginTop: 4,
      }}>
        {hint}
      </span>
    )}
  </label>
);

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid rgb(var(--kotoba-text-rgb) / 0.18)',
  borderRadius: 10,
  fontFamily: 'inherit',
  fontSize: 14,
};

export const TextInput = ({ value, onChange, maxLength, multiline, placeholder }) => {
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <Comp
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      rows={multiline ? 3 : undefined}
      placeholder={placeholder}
      style={{ ...inputStyle, resize: multiline ? 'vertical' : undefined }}
    />
  );
};

export const EnumInput = ({ value, onChange, values }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    style={inputStyle}
  >
    {values.map((v) => (
      <option key={v} value={v}>{v}</option>
    ))}
  </select>
);

export const ListInput = ({ value, onChange, item: itemSchema }) => {
  const items = Array.isArray(value) ? value : [];
  const isObjectItem = itemSchema
    && typeof itemSchema === 'object'
    && !Array.isArray(itemSchema)
    && !itemSchema.type;

  const addItem = () => {
    if (isObjectItem) {
      const defaults = {};
      for (const [f, d] of Object.entries(itemSchema)) {
        if (d?.default !== undefined) defaults[f] = d.default;
        else defaults[f] = '';
      }
      onChange([...items, defaults]);
    } else {
      onChange([...items, '']);
    }
  };

  return (
    <div style={{
      border: '1px dashed rgb(var(--kotoba-text-rgb) / 0.18)',
      borderRadius: 10,
      padding: 10,
    }}>
      {items.length === 0 && (
        <p style={{ fontSize: 12, color: 'rgb(var(--kotoba-text-rgb) / 0.5)', margin: 0 }}>
          No items yet.
        </p>
      )}
      {items.map((it, idx) => (
        <div
          key={idx}
          style={{
            marginBottom: 10,
            padding: 8,
            background: 'rgb(var(--kotoba-text-rgb) / 0.03)',
            borderRadius: 8,
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Item {idx + 1}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const copy = [...items];
                    [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                    onChange(copy);
                  }}
                  style={ghostBtn}
                >↑</button>
              )}
              {idx < items.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const copy = [...items];
                    [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                    onChange(copy);
                  }}
                  style={ghostBtn}
                >↓</button>
              )}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                style={{ ...ghostBtn, color: '#b91c1c' }}
              >Remove</button>
            </div>
          </div>
          {isObjectItem ? (
            <SchemaForm
              schema={itemSchema}
              value={it || {}}
              onChange={(next) => {
                const copy = [...items];
                copy[idx] = next;
                onChange(copy);
              }}
            />
          ) : (
            <TextInput
              value={it}
              onChange={(next) => {
                const copy = [...items];
                copy[idx] = next;
                onChange(copy);
              }}
              maxLength={itemSchema?.max || 200}
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        style={{
          padding: '6px 12px',
          background: 'transparent',
          border: '1px solid rgb(var(--kotoba-text-rgb) / 0.18)',
          borderRadius: 999,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        + Add item
      </button>
    </div>
  );
};

const ghostBtn = {
  background: 'transparent',
  border: '1px solid rgb(var(--kotoba-text-rgb) / 0.18)',
  borderRadius: 8,
  fontSize: 11,
  padding: '2px 8px',
  cursor: 'pointer',
};

export const ColorsInput = ({ value, onChange }) => {
  const colors = Array.isArray(value) ? value : [];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {colors.map((c, i) => (
        <span key={`${c}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            type="color"
            value={c || '#000000'}
            onChange={(e) => {
              const next = [...colors];
              next[i] = e.target.value;
              onChange(next);
            }}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              border: 'none',
              cursor: 'pointer',
              borderRadius: 8,
            }}
          />
          <button
            type="button"
            onClick={() => onChange(colors.filter((_, j) => j !== i))}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: 'rgb(var(--kotoba-text-rgb) / 0.5)',
            }}
            aria-label="Remove colour"
          >×</button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange([...(colors || []), '#888888'])}
        style={{
          padding: '4px 10px',
          background: 'transparent',
          border: '1px solid rgb(var(--kotoba-text-rgb) / 0.18)',
          borderRadius: 999,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        + Colour
      </button>
    </div>
  );
};

const SchemaForm = ({ schema, value, onChange }) => {
  if (!schema || typeof schema !== 'object') return null;
  const safe = value || {};
  return (
    <>
      {Object.entries(schema).map(([field, def]) => {
        // Nested object schema (no `type` marker) — descend.
        if (def
            && typeof def === 'object'
            && !def.type
            && def.default === undefined
            && def.values === undefined) {
          return (
            <FieldRow key={field} label={field}>
              <SchemaForm
                schema={def}
                value={safe[field]}
                onChange={(next) => onChange({ ...safe, [field]: next })}
              />
            </FieldRow>
          );
        }
        const type = def?.type || 'text';
        const update = (next) => onChange({ ...safe, [field]: next });
        const sharedProps = {
          label: field,
          hint: def?.hint,
          required: def?.required,
        };
        if (type === 'text') {
          return (
            <FieldRow key={field} {...sharedProps}>
              <TextInput
                value={safe[field] ?? def?.default ?? ''}
                onChange={update}
                maxLength={def?.max || 240}
              />
            </FieldRow>
          );
        }
        if (type === 'long-text') {
          return (
            <FieldRow key={field} {...sharedProps}>
              <TextInput
                value={safe[field] ?? def?.default ?? ''}
                onChange={update}
                maxLength={def?.max || 800}
                multiline
              />
            </FieldRow>
          );
        }
        if (type === 'enum') {
          return (
            <FieldRow key={field} {...sharedProps}>
              <EnumInput
                value={safe[field] ?? def?.default ?? def?.values?.[0]}
                onChange={update}
                values={def?.values || []}
              />
            </FieldRow>
          );
        }
        if (type === 'list') {
          return (
            <FieldRow key={field} {...sharedProps}>
              <ListInput
                value={safe[field] ?? def?.default ?? []}
                onChange={update}
                item={def?.item}
              />
            </FieldRow>
          );
        }
        if (type === 'colors') {
          return (
            <FieldRow key={field} {...sharedProps}>
              <ColorsInput
                value={safe[field] ?? def?.default ?? []}
                onChange={update}
              />
            </FieldRow>
          );
        }
        return null;
      })}
    </>
  );
};

export default SchemaForm;
