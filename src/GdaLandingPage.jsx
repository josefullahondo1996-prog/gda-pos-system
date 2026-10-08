import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Boxes, Check, ChevronDown, CircleDollarSign, ClipboardCheck,
  Factory, Menu, Package, ShoppingCart, Smartphone, Store, Truck, Users, Wallet, X,
} from 'lucide-react';
import './GdaLandingPage.css';

const modules = [
  { icon: ShoppingCart, title: 'Punto de venta', text: 'Armá el carrito, buscá productos y registrá cobros desde una pantalla rápida para caja.', tags: ['Ventas', 'Cobros', 'Ticket'] },
  { icon: Wallet, title: 'Caja y rendición', text: 'Abrí la caja por turno, registrá movimientos y revisá el cierre con sus medios de pago.', tags: ['Apertura', 'Movimientos', 'Cierre'] },
  { icon: Package, title: 'Productos e inventario', text: 'Mantené catálogo, precios, categorías y existencias conectados con las operaciones.', tags: ['Productos', 'Stock', 'Códigos'] },
  { icon: Boxes, title: 'Compras y proveedores', text: 'Organizá compras y proveedores con información centralizada para el negocio.', tags: ['Compras', 'Costos', 'Proveedores'] },
  { icon: Users, title: 'Clientes', text: 'Consultá clientes, grupos y la información asociada a tus ventas.', tags: ['Clientes', 'Grupos', 'Historial'] },
  { icon: BarChart3, title: 'Informes', text: 'Revisá ventas, caja, productos y actividad desde módulos de informes.', tags: ['Ventas', 'Caja', 'Operación'] },
  { icon: Factory, title: 'Fabricación', text: 'Gestioná recetas, órdenes y etapas de producción desde el mismo sistema.', tags: ['Recetas', 'Órdenes', 'Etapas'] },
  { icon: Truck, title: 'Operación conectada', text: 'Sumá cotizaciones, envíos y movimientos de inventario a tu flujo de trabajo.', tags: ['Cotizaciones', 'Envíos', 'Sucursales'] },
];

const faqs = [
  ['¿GDA POS está conectado a una base de datos real?', 'Sí. El sistema usa Supabase para gestionar el acceso y los datos de los negocios. Las operaciones disponibles dependen de los permisos de cada usuario.'],
  ['¿Puedo vender desde el celular?', 'La aplicación móvil de GDA POS permite trabajar desde el teléfono con el catálogo y las funciones que estén habilitadas para tu usuario.'],
  ['¿Cómo se controla la caja?', 'La caja se abre por turno. Mientras está abierta se habilita la venta, y el cierre permite rendir los importes por medio de pago.'],
  ['¿El sistema de escritorio sigue disponible?', 'Sí. Esta página presenta GDA POS; el acceso al sistema abre la aplicación existente y conserva sus módulos de escritorio.'],
];

function ProductPreview() {
  return (
    <div className="gda-preview" aria-label="Vista ilustrativa del panel de GDA POS">
      <div className="gda-preview-top"><div className="gda-dots"><i /><i /><i /></div><span>GDA POS <b>● En línea</b></span><span className="gda-preview-avatar">G</span></div>
      <div className="gda-preview-body">
        <aside className="gda-preview-side"><strong>GDA<span>POS</span></strong><em className="selected"><Store /> Inicio</em><em><ShoppingCart /> Ventas</em><em><Package /> Productos</em><em><Wallet /> Caja</em><em><BarChart3 /> Informes</em><div className="gda-preview-side-bottom">Tu negocio, en control</div></aside>
        <div className="gda-preview-main"><div className="gda-preview-heading"><div><small>VISTA GENERAL</small><h3>Hola, bienvenido</h3><p>Un resumen claro para empezar el día.</p></div><span>Hoy&nbsp;⌄</span></div>
          <div className="gda-kpis"><div><small>Ventas de hoy</small><b>Gs —</b><i>Datos de tu negocio</i></div><div><small>Productos</small><b>Catálogo</b><i>Stock actualizado</i></div><div><small>Estado de caja</small><b className="gda-kpi-open">Control por turno</b><i>Revisá tu caja</i></div></div>
          <div className="gda-preview-lower"><div className="gda-chart"><div><b>Actividad</b><small>Resumen del negocio</small></div><div className="gda-chart-graph"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="gda-chart-axis"><small>Lun</small><small>Mar</small><small>Mié</small><small>Jue</small><small>Vie</small><small>Sáb</small></div></div><div className="gda-quick"><b>Accesos rápidos</b><div><ShoppingCart /> Punto de venta <ArrowRight /></div><div><ClipboardCheck /> Abrir caja <ArrowRight /></div><div><Smartphone /> App móvil <ArrowRight /></div></div></div>
        </div>
      </div>
      <div className="gda-float-card"><span><Check /></span><div><b>Todo conectado</b><small>Ventas · caja · inventario</small></div></div>
    </div>
  );
}

export default function GdaLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const previous = document.body.className;
    document.body.classList.add('gda-site-page');
    return () => { document.body.className = previous; };
  }, []);

  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="gda-site">
      <div className="gda-topline"><span><i /> SISTEMA DE GESTIÓN PARA TU NEGOCIO</span><span>Ventas · Caja · Inventario · Reportes</span></div>
      <header className="gda-header">
        <a href="#inicio" className="gda-brand" aria-label="GDA POS inicio"><span className="gda-brand-icon">G</span><span>GDA <b>POS</b><small>GESTIÓN SIMPLE. NEGOCIO EN CONTROL.</small></span></a>
        <button className="gda-menu-toggle" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={menuOpen ? 'gda-nav open' : 'gda-nav'}>
          <a href="#soluciones" onClick={closeMenu}>Soluciones <ChevronDown /></a><a href="#modulos" onClick={closeMenu}>Módulos</a><a href="#como-funciona" onClick={closeMenu}>Cómo funciona</a><a href="#faq" onClick={closeMenu}>Preguntas</a>
          <Link className="gda-login-link" to="/login" onClick={closeMenu}>Ingresar <ArrowRight /></Link>
        </nav>
      </header>

      <main>
        <section className="gda-hero" id="inicio"><div className="gda-hero-orb" />
          <div className="gda-hero-copy"><div className="gda-eyebrow"><span>GDA POS</span><i /> UNA SOLA PLATAFORMA</div><h1>Tu negocio,<br /><span>en orden.</span></h1><p className="gda-hero-lead">Vendé, controlá tu caja y mantené tu inventario conectado. GDA POS reúne las herramientas de tu operación en un solo sistema.</p>
            <div className="gda-hero-actions"><Link className="gda-btn-primary" to="/login">Entrar al sistema <ArrowRight /></Link><a className="gda-btn-secondary" href="#modulos">Conocer módulos</a></div>
            <div className="gda-hero-proof"><span><Check /> Acceso por usuario</span><span><Check /> Datos en Supabase</span><span><Check /> Escritorio y móvil</span></div>
          </div><div className="gda-hero-visual"><ProductPreview /></div>
          <div className="gda-hero-bottom"><span>HECHO PARA EL TRABAJO DE TODOS LOS DÍAS</span><div><b>01</b> VENDER <i /> <b>02</b> CONTROLAR <i /> <b>03</b> CRECER</div></div>
        </section>

        <section className="gda-strip" id="soluciones"><div><CircleDollarSign /><span><b>Ventas y caja</b><small>Operaciones por turno</small></span></div><div><Package /><span><b>Stock conectado</b><small>Productos centralizados</small></span></div><div><BarChart3 /><span><b>Información clara</b><small>Informes del negocio</small></span></div><div><Smartphone /><span><b>Listo para móvil</b><small>También desde tu celular</small></span></div></section>

        <section className="gda-section gda-modules" id="modulos"><div className="gda-section-heading"><div><div className="gda-eyebrow"><i /> HERRAMIENTAS PARA TU OPERACIÓN</div><h2>Todo conectado.<br /><span>Todo bajo control.</span></h2></div><p>Empezá por lo que usás hoy. Tus ventas, caja, productos e informes forman parte del mismo sistema.</p></div>
          <div className="gda-module-grid">{modules.map(({ icon: Icon, title, text, tags }, index) => <article className={`gda-module-card ${index === 0 ? 'featured' : ''}`} key={title}><div className="gda-module-icon"><Icon /></div><span className="gda-module-index">0{index + 1}</span><h3>{title}</h3><p>{text}</p><div className="gda-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div></article>)}</div>
        </section>

        <section className="gda-workflow" id="como-funciona"><div className="gda-workflow-intro"><div className="gda-eyebrow"><i /> UN FLUJO SIMPLE</div><h2>De la apertura<br />al cierre.</h2><p>El equipo trabaja con pasos claros y la información queda en el mismo sistema para que puedas seguir la operación.</p><Link to="/login" className="gda-text-link">Ingresar a GDA POS <ArrowRight /></Link></div><div className="gda-steps"><article><span>01</span><div className="gda-step-icon"><Wallet /></div><h3>Abrí la caja</h3><p>Registrá el fondo inicial y comenzá el turno de trabajo.</p></article><article><span>02</span><div className="gda-step-icon"><ShoppingCart /></div><h3>Registrá tus ventas</h3><p>Buscá productos, armá el pedido y cargá el medio de pago.</p></article><article><span>03</span><div className="gda-step-icon"><ClipboardCheck /></div><h3>Rendí el turno</h3><p>Revisá los importes de caja y completá el cierre con el conteo.</p></article></div></section>

        <section className="gda-why"><div className="gda-why-art"><div className="gda-grid-art" /><div className="gda-why-card"><div className="gda-why-card-top"><span>GDA POS</span><i>●</i></div><small>OPERACIÓN DEL NEGOCIO</small><b>Una vista.<br />Más claridad.</b><div className="gda-why-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="gda-why-labels"><span>VENTAS</span><span>CAJA</span><span>STOCK</span></div></div><div className="gda-why-badge"><Check /> Datos de tu empresa</div></div><div className="gda-why-copy"><div className="gda-eyebrow"><i /> CONTROL DESDE UN MISMO LUGAR</div><h2>Menos pasos.<br /><span>Más visibilidad.</span></h2><p>Cuando la caja y los productos usan la misma información, podés seguir mejor lo que ocurre durante el día.</p><ul><li><Check /> Acceso a funciones según el rol de cada usuario</li><li><Check /> Ventas vinculadas al control de caja</li><li><Check /> Inventario asociado a los productos</li><li><Check /> Interfaz para escritorio y aplicación móvil</li></ul><Link className="gda-btn-primary" to="/login">Acceder a mi negocio <ArrowRight /></Link></div></section>

        <section className="gda-mobile-section"><div className="gda-mobile-copy"><div className="gda-eyebrow"><i /> GDA POS EN TU CELULAR</div><h2>Tu operación<br /><span>te acompaña.</span></h2><p>Accedé a las funciones móviles de GDA POS desde el teléfono. Usá tus credenciales y trabajá con los datos de tu negocio.</p><div className="gda-mobile-points"><span><Check /> Punto de venta móvil</span><span><Check /> Productos y clientes</span><span><Check /> Caja e informes</span></div><a className="gda-btn-light" href="https://gda-pos-mobile.vercel.app" target="_blank" rel="noreferrer">Abrir GDA POS móvil <ArrowRight /></a></div><div className="gda-phone-wrap"><div className="gda-phone"><div className="gda-phone-notch" /><div className="gda-phone-head"><span>GDA POS</span><i>●</i></div><div className="gda-phone-greeting"><small>BUEN DÍA</small><b>Tu negocio,<br />en marcha.</b></div><div className="gda-phone-card"><small>Acceso rápido</small><div><ShoppingCart /><b>Vender</b><ArrowRight /></div><div><Wallet /><b>Caja</b><ArrowRight /></div><div><Package /><b>Productos</b><ArrowRight /></div></div><div className="gda-phone-nav"><span>⌂</span><span>▦</span><span>▤</span><span>◷</span></div></div><div className="gda-phone-orbit" /></div></section>

        <section className="gda-faq" id="faq"><div className="gda-faq-title"><div className="gda-eyebrow"><i /> PREGUNTAS FRECUENTES</div><h2>¿Querés saber<br /><span>algo más?</span></h2><p>Información práctica para empezar a usar GDA POS.</p></div><div className="gda-faq-list">{faqs.map(([question, answer], index) => <article key={question} className={openFaq === index ? 'active' : ''}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><i>{openFaq === index ? '−' : '+'}</i></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

        <section className="gda-cta"><div className="gda-cta-orb" /><div className="gda-eyebrow"><i /> EMPEZÁ CON GDA POS</div><h2>Tu negocio merece<br />una vista completa.</h2><p>Ingresá a tu cuenta para continuar con la operación.</p><Link className="gda-btn-light" to="/login">Ingresar al sistema <ArrowRight /></Link><span className="gda-cta-note">El acceso depende de tu usuario y sus permisos.</span></section>
      </main>
      <footer className="gda-footer"><a href="#inicio" className="gda-brand"><span className="gda-brand-icon">G</span><span>GDA <b>POS</b><small>GESTIÓN SIMPLE. NEGOCIO EN CONTROL.</small></span></a><span>Ventas, caja e inventario en un solo sistema.</span><div><a href="#modulos">Módulos</a><a href="#faq">Ayuda</a><Link to="/login">Ingresar</Link></div><small>© {new Date().getFullYear()} GDA POS</small></footer>
    </div>
  );
}
