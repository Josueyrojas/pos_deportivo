import { Link } from 'react-router-dom'

export default function Privacidad() {
  return (
    <div className="min-h-screen bg-slate-100 py-10 px-6">
      <div className="max-w-2xl mx-auto card p-8">
        <Link to="/login" className="text-sm text-slate-500 hover:text-ink">← Volver</Link>

        <h1 className="text-2xl font-bold text-ink mt-4 mb-1">Aviso de Privacidad y Términos de Uso</h1>
        <p className="text-xs text-slate-400 mb-6">Última actualización: septiembre de 2026</p>

        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          Esta página es una plantilla de buena fe, redactada para este sistema. No sustituye
          asesoría legal — si vas a operar con clientes reales, revísala con un abogado
          especializado en protección de datos antes de depender de ella.
        </div>

        <section className="mb-6">
          <h2 className="font-bold text-ink mb-2">Aviso de Privacidad</h2>
          <div className="text-sm text-slate-600 space-y-3">
            <p>
              <b>Responsable:</b> Yañez Society es responsable del tratamiento de los datos
              personales que se describen en este aviso, correspondientes a las cuentas de
              acceso de este sistema de punto de venta.
            </p>
            <p>
              <b>Datos que se recaban:</b> nombre completo y correo electrónico de cada persona
              con una cuenta en el sistema (dueños de negocio, cajeros y administradores de la
              plataforma). Estos datos los da de alta directamente el administrador del negocio
              correspondiente, o el administrador de la plataforma al crear un negocio nuevo.
            </p>
            <p>
              <b>Este sistema no recaba datos personales de los clientes finales de cada
              negocio.</b> Las ventas registradas guardan productos, cantidades y montos —
              nunca nombre, teléfono, correo ni ningún otro dato del comprador.
            </p>
            <p>
              <b>Finalidades:</b> crear y administrar cuentas de acceso, operar el punto de
              venta, el inventario, los reportes y el corte de caja de cada negocio, y permitir
              que el administrador de la plataforma dé soporte cuando se solicite.
            </p>
            <p>
              <b>Cómo se protegen:</b> las contraseñas nunca se almacenan en texto plano ni son
              visibles para nadie, ni siquiera para los administradores. Cada negocio está
              aislado técnicamente del resto: nadie fuera de tu negocio puede ver tu catálogo,
              tus ventas ni tu inventario.
            </p>
            <p>
              <b>Almacenamiento y transferencias:</b> los datos se alojan con Supabase, el
              proveedor de infraestructura del sistema. No se venden ni se comparten con
              terceros para fines distintos a operar el servicio.
            </p>
            <p>
              <b>Derechos ARCO:</b> puedes solicitar acceder, rectificar, cancelar u oponerte al
              tratamiento de tus datos personales escribiendo a{' '}
              <a href="mailto:josueyrojas@gmail.com" className="text-brand font-semibold">josueyrojas@gmail.com</a>.
            </p>
            <p>
              <b>Cambios a este aviso:</b> puede actualizarse; la versión vigente siempre estará
              disponible en esta misma página.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-bold text-ink mb-2">Términos de Uso</h2>
          <div className="text-sm text-slate-600 space-y-3">
            <p>El servicio se ofrece "tal cual" a cada negocio registrado en la plataforma.</p>
            <p>
              Cada negocio es responsable de la exactitud de su propio catálogo, precios,
              inventario y registros de venta.
            </p>
            <p>
              El acceso se otorga únicamente mediante cuentas creadas por el administrador del
              negocio correspondiente o por el administrador de la plataforma — no hay registro
              público.
            </p>
            <p>
              No está permitido compartir credenciales de acceso ni intentar acceder a datos de
              un negocio distinto al propio.
            </p>
            <p>El servicio se ofrece sin garantía de disponibilidad ininterrumpida.</p>
            <p>El acceso puede suspenderse si se detecta uso indebido de la plataforma.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
