import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="section wrap" style={{ textAlign: 'center', minHeight: '55vh' }}>
      <div className="ghost-00" style={{ position: 'static', transform: 'none', fontSize: 'clamp(120px,20vw,240px)' }} data-glitch>404</div>
      <h1 className="display" data-fx="possession" style={{ fontSize: 'clamp(22px,3vw,32px)', marginTop: 10 }}>This Page Sold Through</h1>
      <p style={{ color: 'var(--silver)', margin: '14px 0 26px' }}>Whatever was here is gone — like every run eventually is.</p>
      <Link className="btn" to="/shop">Shop the catalog</Link>
    </section>
  );
}
