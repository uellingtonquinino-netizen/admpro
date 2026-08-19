export default function DesktopBloqueado() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '32px', gap: '16px',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16, background: 'rgba(47,127,245,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
      }}>
        📱
      </div>
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Acesse pelo celular</h1>
      <p style={{ margin: 0, maxWidth: 320, color: '#8996ac', fontSize: 14, lineHeight: 1.5 }}>
        Este acesso foi feito só pra uso no celular. Abre esse mesmo endereço no navegador
        do seu celular pra continuar.
      </p>
    </div>
  )
}
