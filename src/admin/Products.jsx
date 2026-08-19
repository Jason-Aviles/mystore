import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminListProducts, adminDeleteProduct } from './adminData';
import { totalStock } from '../lib/catalog';

export default function Products() {
  const [products, setProducts] = useState([]);
  const load = () => adminListProducts().then(setProducts);
  useEffect(() => { load(); }, []);

  async function remove(handle, title) {
    if (!window.confirm(`Remove "${title}" from the store?\n\nIt's archived, not destroyed — past orders keep their record.`)) return;
    await adminDeleteProduct(handle);
    load();
  }

  const visible = products.filter((p) => p.status !== 'archived');

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Products</h1>
        <Link className="btn btn-sm" to="/admin/products/new">+ Add Product</Link>
      </div>
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Flags</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.handle}>
                <td><img src={p.images[0]} alt="" /></td>
                <td>
                  <b>{p.title}</b>
                  <div style={{ fontSize: 11, color: 'var(--silver)' }}>{p.handle}</div>
                </td>
                <td>${Number(p.price).toFixed(2)}</td>
                <td>{totalStock(p)}</td>
                <td>
                  {p.featured && <span className="pill info">Featured</span>}{' '}
                  {p.bestseller && <span className="pill">Best seller</span>}{' '}
                  {p.newArrival && <span className="pill ok">New</span>}
                </td>
                <td className="actions">
                  <Link className="btn btn-ghost btn-sm" to={`/admin/products/${p.handle}`}>Edit</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(p.handle, p.title)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
