import { useState } from 'react';
import { mergeHomepage } from '../lib/homeContent';
import { uploadMedia, uploadProductImage } from './adminData';
import { HOMEPAGE_FIELD_GROUPS } from './homepageFields';

function moveItem(items, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function MediaField({ value, kind, itemType, label, busy, onChange, onUpload }) {
  const actualKind = kind === 'media' ? (itemType === 'video' ? 'video' : 'image') : kind;
  const accept = actualKind === 'image' ? 'image/*' : actualKind === 'file' ? '.glb,model/gltf-binary' : 'video/*';
  return (
    <span className="img-field">
      {value && actualKind === 'image' && <img src={value} alt="" />}
      {value && actualKind === 'video' && (
        <video src={value} muted loop autoPlay playsInline style={{ maxWidth: '100%', maxHeight: 130, border: '1px solid var(--line)' }} />
      )}
      {!value && <span className="img-empty">No media set</span>}
      <span className="img-actions">
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          <input type="file" accept={accept} hidden disabled={busy}
            onChange={(event) => onUpload(event.target.files?.[0], actualKind)} />
        </label>
        {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Remove</button>}
      </span>
      <input type="text" inputMode="url" aria-label={`${label} URL`} placeholder="…or paste a media URL" value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </span>
  );
}

function SimpleField({ field, value, itemType, busy, onChange, onUpload }) {
  if (field.type === 'textarea') {
    return <textarea aria-label={field.label} rows={3} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.type === 'select') {
    return (
      <select aria-label={field.label} value={value ?? field.options?.[0] ?? ''} onChange={(event) => onChange(event.target.value)}>
        {(field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}
      </select>
    );
  }
  if (['image', 'video', 'media', 'file'].includes(field.type)) {
    return <MediaField value={value} kind={field.type} itemType={itemType} label={field.label} busy={busy} onChange={onChange} onUpload={onUpload} />;
  }
  return <input type="text" aria-label={field.label} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />;
}

function ListField({ field, items, uploadKey, setUploadKey, onChange, onError }) {
  const rows = Array.isArray(items) ? items : [];

  const setItem = (index, key, value) => {
    onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  const upload = async (index, key, file, kind) => {
    if (!file) return;
    const token = `${field.key}-${index}-${key}`;
    setUploadKey(token);
    onError('');
    try {
      const url = kind === 'image' ? await uploadProductImage(file) : await uploadMedia(file);
      setItem(index, key, url);
    } catch (error) {
      onError(error.message || 'Upload failed');
    } finally {
      setUploadKey('');
    }
  };

  return (
    <div className="home-list-editor">
      {rows.map((item, index) => (
        <div className="settings-group" key={`${field.key}-${index}`} style={{ margin: '10px 0', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <b>{field.itemLabel} {index + 1}</b>
            <span className="img-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0}
                onClick={() => onChange(moveItem(rows, index, -1))}>↑</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === rows.length - 1}
                onClick={() => onChange(moveItem(rows, index, 1))}>↓</button>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </span>
          </div>
          {field.itemFields.map((itemField) => (
            <div className="settings-field" key={itemField.key}>
              <span className="lbl">{itemField.label}</span>
              <SimpleField
                field={itemField}
                value={item[itemField.key]}
                itemType={item.type}
                busy={uploadKey === `${field.key}-${index}-${itemField.key}`}
                onChange={(value) => setItem(index, itemField.key, value)}
                onUpload={(file, kind) => upload(index, itemField.key, file, kind)}
              />
              {itemField.hint && <small>{itemField.hint}</small>}
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm"
        onClick={() => onChange([...rows, structuredClone(field.newItem)])}>Add {field.itemLabel}</button>
    </div>
  );
}

export default function HomepageEditor({ value, onChange, onError }) {
  const homepage = mergeHomepage(value);
  const [uploadKey, setUploadKey] = useState('');

  const set = (key, nextValue) => onChange({ ...homepage, [key]: nextValue });
  const upload = async (field, file, kind) => {
    if (!file) return;
    setUploadKey(field.key);
    onError('');
    try {
      const url = kind === 'image' ? await uploadProductImage(file) : await uploadMedia(file);
      set(field.key, url);
    } catch (error) {
      onError(error.message || 'Upload failed');
    } finally {
      setUploadKey('');
    }
  };

  return HOMEPAGE_FIELD_GROUPS.map((group) => (
    <fieldset className="settings-group" key={group.title}>
      <legend>{group.title}</legend>
      {group.fields.map((field) => (
        <div className="settings-field" key={field.key}>
          <span className="lbl">{field.label}</span>
          {field.type === 'list' ? (
            <ListField
              field={field}
              items={homepage[field.key]}
              uploadKey={uploadKey}
              setUploadKey={setUploadKey}
              onChange={(items) => set(field.key, items)}
              onError={onError}
            />
          ) : (
            <SimpleField
              field={field}
              value={homepage[field.key]}
              busy={uploadKey === field.key}
              onChange={(nextValue) => set(field.key, nextValue)}
              onUpload={(file, kind) => upload(field, file, kind)}
            />
          )}
          {field.hint && <small>{field.hint}</small>}
        </div>
      ))}
    </fieldset>
  ));
}
