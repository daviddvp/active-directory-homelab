import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import sections from './content.json';

function CodeBlock({children}: {children?: ReactNode}) {
  const [copied,setCopied]=useState(false);
  return <div className="code-wrap"><button className="copy" onClick={async e=>{
    const value=e.currentTarget.parentElement?.querySelector('pre')?.textContent ?? '';
    try { await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1800); }
    catch { setCopied(false); }
  }} aria-label="Copiar bloque de código">{copied?'Copiado ✓':'Copiar'}</button><pre>{children}</pre></div>;
}
const nodes=[['DC01','10.10.10.10','AD DS · DNS · GC'],['DC02','10.10.10.11','AD DS · DNS · GC'],['FS01','10.10.10.20','SMB · NTFS'],['APP01','10.10.10.30','LDAP sobre TLS'],['CA01','10.10.10.40','AD CS · certificados'],['CLIENT01','10.10.10.101','Windows 11 Pro'],['LINUX01','10.10.10.102','Ubuntu · SSSD']];
export default function App(){
  const [active,setActive]=useState('overview');const [menu,setMenu]=useState(false);const [search,setSearch]=useState('');
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)setActive(e.target.id);},{rootMargin:'-12% 0px -68% 0px'});document.querySelectorAll('section[id]').forEach(e=>observer.observe(e));return()=>observer.disconnect();},[]);
  const shown=sections.filter(s=>(s.title+' '+s.body).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  return <><a className="skip" href="#main">Ir al contenido</a><aside className={menu?'sidebar open':'sidebar'}>
    <a className="brand" href="#overview" onClick={()=>setMenu(false)}><span className="logo">L<span> / </span></span><span>LAB<span className="brand-sub">Infrastructure handbook</span></span></a>
    <div className="side-label">DOCUMENTACIÓN / V2.0</div><nav aria-label="Índice de documentación"><a className={active==='overview'?'active':''} href="#overview" onClick={()=>setMenu(false)}>Visión general</a>{sections.map(s=><a key={s.id} className={active===s.id?'active':''} href={'#'+s.id} onClick={()=>{setSearch('');setMenu(false)}}>{s.title}</a>)}</nav>
    <div className="side-foot"><span className="dot"/> Laboratorio aislado<br/><small>Revisión · 07 octubre 2026</small></div>
  </aside><div className="shell"><header><span className="crumb">LAB <span>/</span> Identity & access</span><div className="header-actions"><a href="./README.md" download>↓ README</a><button className="menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="Abrir índice">☰</button></div></header>
  <main id="main"><section id="overview" className="hero"><div className="eyebrow"><span className="dot"/> GUÍA DE INFRAESTRUCTURA EMPRESARIAL</div><h1>Una identidad.<br/><span>Todo el laboratorio.</span></h1><p className="lead">De la primera consulta DNS a una autenticación segura. Arquitectura, despliegue y operación de Active Directory + LDAP, paso a paso.</p><div className="hero-actions"><a className="primary" href="#fase-03">Comenzar el despliegue <span>↗</span></a><a className="secondary" href="#architecture">Explorar arquitectura ↓</a></div><div className="stats"><div><strong>07</strong><span>máquinas virtuales</span></div><div><strong>02</strong><span>controladores de dominio</span></div><div><strong>21</strong><span>secciones técnicas</span></div><div><strong>TLS</strong><span>LDAP protegido</span></div></div></section>
  <section id="architecture" className="architecture"><div className="section-kicker">EL SISTEMA, DE UN VISTAZO</div><div className="section-heading"><h2>Arquitectura del laboratorio</h2><span className="pill">10.10.10.0/24</span></div><p className="muted">Un segmento aislado. Dos DC activos. Servicios con responsabilidades claras.</p><div className="network"><div className="gateway"><span>↑ SALIDA OPCIONAL A INTERNET</span><strong>NAT / Gateway</strong><code>10.10.10.1</code></div><div className="bus"><span>LAB-AD · ad.lab.test · NetBIOS LAB</span></div><div className="nodes">{nodes.map((n,i)=><div className={i<2?'node dc':'node'} key={n[0]}><span className="node-icon">{i<2?'◈':'▣'}</span><strong>{n[0]}</strong><code>{n[1]}</code><small>{n[2]}</small></div>)}</div><div className="network-note">DC01 ↔ DC02 <span>Replicación AD + DNS · SYSVOL por DFSR</span></div></div></section>
  <div className="guide-head"><div><div className="section-kicker">MANUAL OPERATIVO</div><h2>Construir. Validar. Comprender.</h2></div><label className="search"><span>Buscar en la guía</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="DNS, LDAPS, GPO…"/></label></div>
  <div className="notice"><strong>Guía revisada, pruebas por ejecutar.</strong> Los comandos se ejecutan en las VMs indicadas. La web es documental y no se conecta al dominio.</div>
  <div aria-live="polite" className="search-count">{search && `${shown.length} secciones encontradas`}</div>
  {shown.map(s=><section id={s.id} className="doc-section" key={s.id}><div className="section-number">{s.title.slice(0,2)} / LAB</div><h2>{s.title.slice(5)}</h2><ReactMarkdown remarkPlugins={[remarkGfm]} components={{pre:CodeBlock,table:({children})=><div className="table-wrap"><table>{children}</table></div>,a:({href,children})=><a href={href} target="_blank" rel="noreferrer">{children}</a>}}>{s.body}</ReactMarkdown><a className="top-link" href="#overview">Volver al inicio ↑</a></section>)}
  {shown.length===0&&<p className="empty">No hay resultados. Prueba otro término.</p>}
  <footer><span>LAB / Active Directory + LDAP</span><span>Guía v2.0 · Octubre 2026</span><a href="#overview">↑ Inicio</a></footer></main></div></>;
}
