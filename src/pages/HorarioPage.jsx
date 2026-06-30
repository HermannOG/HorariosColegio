import { useEffect, useState } from 'react'
import {
  listarProfesores, listarGrupos, listarMaterias, listarActividades, obtenerGrilla,
  obtenerHorarioActual, guardarHorario, obtenerMallas, DIAS,
} from '../lib/datos.js'
import { generarHorario } from '../lib/generador.js'
import { validarYAplicarMovimiento } from '../lib/validarMovimiento.js'
import { generarDocxHorario, descargarBlob, nombreArchivoSeguro } from '../lib/exportarHorarioWord.js'
import { PageHeader, Button, Card, Select, Spinner, EmptyState, Pill } from '../components/ui.jsx'

const DIAS_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' }

export default function HorarioPage() {
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [profesores, setProfesores] = useState([])
  const [grupos, setGrupos] = useState([])
  const [materias, setMaterias] = useState([])
  const [actividades, setActividades] = useState([])
  const [bloques, setBloques] = useState([])
  const [mallas, setMallas] = useState({})
  const [horario, setHorario] = useState({ asignaciones: [], conflictos: [], avisos: [] })
  const [vista, setVista] = useState('profesor') // 'profesor' | 'grupo'
  const [seleccionId, setSeleccionId] = useState('')
  const [modoReparto, setModoReparto] = useState('parejo') // 'parejo' | 'temprano'
  const [alertaMovimiento, setAlertaMovimiento] = useState(null)
  const [guardandoMovimiento, setGuardandoMovimiento] = useState(false)
  const [descargando, setDescargando] = useState(false)

  async function cargarTodo() {
    const [profs, gr, mat, act, grilla, hor, malla] = await Promise.all([
      listarProfesores(), listarGrupos(), listarMaterias(), listarActividades(), obtenerGrilla(), obtenerHorarioActual(), obtenerMallas(),
    ])
    setProfesores(profs)
    setGrupos(gr)
    setMaterias(mat)
    setActividades(act)
    setBloques(grilla.bloques)
    setHorario(hor)
    setMallas(malla)
    if (profs.length > 0) setSeleccionId(profs[0].id)
  }

  useEffect(() => {
    cargarTodo().then(() => setCargando(false))
  }, [])

  // Devuelve solo los profesores con asignaciones VÁLIDAS, y resincroniza
  // los valores que el generador necesita tomando siempre el dato más
  // reciente de su fuente:
  //   - Asignaciones de MATERIA: deben existir en la malla del año del
  //     grupo correspondiente; se resincronizan leccionesPorSemana,
  //     bloqueContinuo y puedeAtravesarAlmuerzo desde esa fila de malla.
  //   - Asignaciones de ACTIVIDAD: deben existir todavía en la colección
  //     de actividades (puede que se haya borrado); se resincronizan los
  //     mismos campos desde la ficha de la actividad. No tienen grupo, así
  //     que no se validan contra ninguna malla curricular.
  // También devuelve la lista de asignaciones descartadas, para avisar.
  function filtrarAsignacionesContraMalla(listaProfesores) {
    const descartadas = []
    const profesoresFiltrados = listaProfesores.map(prof => {
      const asignacionesValidas = (prof.asignaciones || [])
        .map(asig => {
          if (asig.esActividad) {
            const actividad = actividades.find(a => a.id === asig.actividadId)
            if (!actividad) {
              descartadas.push({
                profesorNombre: prof.nombre,
                grupoNombre: 'Actividad',
                materiaId: null,
                actividadNombre: null,
              })
              return null
            }
            return {
              ...asig,
              leccionesPorSemana: Number(actividad.leccionesPorSemana) || 0,
              bloqueContinuo: !!actividad.bloqueContinuo,
              puedeAtravesarAlmuerzo: !!actividad.puedeAtravesarAlmuerzo,
            }
          }
          const grupo = grupos.find(g => g.id === asig.grupoId)
          if (!grupo) return null
          const filasMalla = mallas[grupo.anio] || []
          const filaMalla = filasMalla.find(f => f.materiaId === asig.materiaId)
          if (!filaMalla) {
            descartadas.push({
              profesorNombre: prof.nombre,
              grupoNombre: grupo.nombre,
              materiaId: asig.materiaId,
            })
            return null
          }
          return {
            ...asig,
            leccionesPorSemana: Number(filaMalla.leccionesPorSemana) || 0,
            bloqueContinuo: !!filaMalla.bloqueContinuo,
            puedeAtravesarAlmuerzo: !!filaMalla.puedeAtravesarAlmuerzo,
          }
        })
        .filter(Boolean)
      return { ...prof, asignaciones: asignacionesValidas }
    })
    return { profesoresFiltrados, descartadas }
  }

  async function generar() {
    setGenerando(true)
    const grilla = await obtenerGrilla()
    const { profesoresFiltrados, descartadas } = filtrarAsignacionesContraMalla(profesores)
    const resultado = generarHorario({ profesores: profesoresFiltrados, dias: DIAS, bloques: grilla.bloques, modoReparto })
    resultado.asignacionesDescartadas = descartadas
    await guardarHorario(resultado)
    setHorario(resultado)
    setGenerando(false)
  }

  // Maneja el resultado de soltar una clase arrastrada en la vista "Por
  // grupo": valida el movimiento con las mismas reglas duras del
  // generador y, si es válido, actualiza y guarda el horario; si no, deja
  // el horario intacto y muestra una alerta con el motivo exacto.
  // (Las actividades nunca aparecen en esta vista, así que nunca llegan
  // acá como origen ni como destino.)
  async function manejarSoltar(origen, destino) {
    const resultado = validarYAplicarMovimiento({
      origen,
      destino,
      horario,
      contexto: { bloques, grupos, mallas },
    })

    if (!resultado.valido) {
      setAlertaMovimiento(resultado.motivo)
      return
    }

    setAlertaMovimiento(null)
    setGuardandoMovimiento(true)
    const nuevoHorario = { ...horario, asignaciones: resultado.nuevasAsignaciones }
    await guardarHorario(nuevoHorario)
    setHorario(nuevoHorario)
    setGuardandoMovimiento(false)
  }

  const mapaMaterias = Object.fromEntries(materias.map(m => [m.id, m.nombre]))
  const mapaActividades = Object.fromEntries(actividades.map(a => [a.id, a.nombre]))
  const mapaGrupos = Object.fromEntries(grupos.map(g => [g.id, g.nombre]))
  const mapaProfesores = Object.fromEntries(profesores.map(p => [p.id, p.nombre]))

  // Para cada profesor, la lista de nombres de materias que da (sin
  // repetir), derivada de sus asignaciones — se usa para mostrarlas junto
  // al nombre en el selector de la vista "Por profesor". Las actividades
  // no cuentan como "materia" acá, para no confundir con lo que se le da
  // a un grupo.
  const mapaMateriasPorProfesor = Object.fromEntries(
    profesores.map(p => {
      const nombresUnicos = [...new Set((p.asignaciones || []).filter(a => !a.esActividad).map(a => mapaMaterias[a.materiaId]).filter(Boolean))]
      return [p.id, nombresUnicos]
    })
  )

  // Genera el .docx del horario actualmente seleccionado (profesor o
  // grupo, según `vista`) con exactamente los mismos datos que se ven en
  // pantalla, y dispara la descarga en el navegador.
  async function descargarWord() {
    if (!seleccionId || !horario.generadoEn) return
    setDescargando(true)
    try {
      const esProfesor = vista === 'profesor'
      const nombreSeleccion = esProfesor ? (mapaProfesores[seleccionId] || '') : (mapaGrupos[seleccionId] || '')
      const materiasDelProfe = esProfesor ? (mapaMateriasPorProfesor[seleccionId] || []) : []
      const titulo = esProfesor && materiasDelProfe.length > 0
        ? `${nombreSeleccion} — ${materiasDelProfe.join(', ')}`
        : nombreSeleccion

      const blob = await generarDocxHorario({
        modo: vista,
        idSeleccionado: seleccionId,
        titulo,
        bloques,
        asignaciones: horario.asignaciones,
        mapaMaterias,
        mapaActividades,
        mapaGrupos,
        mapaProfesores,
      })

      const prefijo = esProfesor ? 'horario_profesor' : 'horario_grupo'
      descargarBlob(blob, `${prefijo}_${nombreArchivoSeguro(nombreSeleccion)}.docx`)
    } finally {
      setDescargando(false)
    }
  }


  const listaSeleccion = vista === 'profesor' ? profesores : grupos

  // Compara, para cada grupo, lo que pide la malla de su año contra lo que
  // realmente quedó asignado a profesores (sumando todas las asignaciones de
  // ese grupo+materia entre todos los profesores). Las actividades no
  // tienen grupo ni están en ninguna malla, así que nunca entran en este
  // cálculo (la función ya solo suma por a.grupoId, que las actividades no
  // tienen).
  const huecosMalla = calcularHuecosMalla({ profesores, grupos, mallas, mapaMaterias })

  if (cargando) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Horario"
        subtitle="Generá el horario automáticamente a partir de los profesores, grupos y materias cargados."
        action={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-ink-400 mb-1">Reparto de lecciones impares</p>
              <div className="flex gap-1.5">
                <Pill tone="ink" active={modoReparto === 'parejo'} onClick={() => setModoReparto('parejo')}>Parejo entre días</Pill>
                <Pill tone="ink" active={modoReparto === 'temprano'} onClick={() => setModoReparto('temprano')}>Salir temprano</Pill>
              </div>
            </div>
            <Button onClick={generar} disabled={generando || profesores.length === 0}>
              {generando ? 'Generando…' : 'Generar horario'}
            </Button>
          </div>
        }
      />

      <div className="px-10 py-8">
        {profesores.length === 0 ? (
          <EmptyState
            title="Todavía no hay nada para generar"
            description="Agregá al menos un profesor con sus asignaciones antes de generar el horario."
          />
        ) : (
          <>
            {horario.asignacionesDescartadas?.length > 0 && (
              <AvisoDescartadas descartadas={horario.asignacionesDescartadas} mapaMaterias={mapaMaterias} />
            )}
            {huecosMalla.length > 0 && <AvisoHuecosMalla huecos={huecosMalla} />}
            {alertaMovimiento && (
              <AlertaMovimiento mensaje={alertaMovimiento} onCerrar={() => setAlertaMovimiento(null)} />
            )}

            {horario.generadoEn && (
              <ResumenGeneracion horario={horario} mapaProfesores={mapaProfesores} mapaGrupos={mapaGrupos} mapaMaterias={mapaMaterias} mapaActividades={mapaActividades} />
            )}
            {/* Aviso de huecos de profesor oculto a pedido — el generador
                sigue calculando horario.avisos por si se quiere mostrar
                de nuevo más adelante, solo se dejó de renderizar acá. */}

            <div className="flex items-center gap-3 mb-5 mt-2">
              <div className="flex gap-1.5">
                <Pill tone="ink" active={vista === 'profesor'} onClick={() => { setVista('profesor'); setSeleccionId(profesores[0]?.id || '') }}>Por profesor</Pill>
                <Pill tone="ink" active={vista === 'grupo'} onClick={() => { setVista('grupo'); setSeleccionId(grupos[0]?.id || '') }}>Por grupo</Pill>
              </div>
              <Select value={seleccionId} onChange={e => setSeleccionId(e.target.value)} className="max-w-xs">
                {vista === 'profesor'
                  ? listaSeleccion.map(item => {
                      const materiasDelProfe = mapaMateriasPorProfesor[item.id] || []
                      const etiqueta = materiasDelProfe.length > 0
                        ? `${item.nombre} — ${materiasDelProfe.join(', ')}`
                        : `${item.nombre} (sin materias asignadas)`
                      return <option key={item.id} value={item.id}>{etiqueta}</option>
                    })
                  : listaSeleccion.map(item => (
                      <option key={item.id} value={item.id}>{item.nombre}</option>
                    ))}
              </Select>
              {horario.generadoEn && seleccionId && (
                <Button variant="secondary" onClick={descargarWord} disabled={descargando}>
                  {descargando ? 'Generando Word…' : '⬇ Descargar Word'}
                </Button>
              )}
            </div>

            {!horario.generadoEn ? (
              <EmptyState title="Aún no generaste un horario" description="Hacé clic en «Generar horario» arriba para crear la primera versión." />
            ) : seleccionId ? (
              <>
                {vista === 'grupo' && (
                  <p className="text-xs text-ink-400 mb-2">
                    Podés arrastrar una clase a otro espacio para moverla, o soltarla sobre otra para intercambiarlas. Los cambios se guardan al instante.
                  </p>
                )}
                <TablaHorario
                  bloques={bloques}
                  asignaciones={horario.asignaciones}
                  modo={vista}
                  idSeleccionado={seleccionId}
                  mapaMaterias={mapaMaterias}
                  mapaActividades={mapaActividades}
                  mapaGrupos={mapaGrupos}
                  mapaProfesores={mapaProfesores}
                  editable={vista === 'grupo' && !guardandoMovimiento}
                  onSoltar={manejarSoltar}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function AlertaMovimiento({ mensaje, onCerrar }) {
  return (
    <div className="mb-4 px-4 py-3 rounded-md bg-clay-50 border border-clay-300 text-sm text-clay-800 flex items-start justify-between gap-3">
      <p><span className="font-medium">No se pudo mover esa clase:</span> {mensaje}</p>
      <button onClick={onCerrar} className="text-clay-500 hover:text-clay-700 shrink-0">✕</button>
    </div>
  )
}

function AvisoDescartadas({ descartadas, mapaMaterias }) {
  return (
    <div className="mb-4 px-4 py-3 rounded-md bg-clay-50 border border-clay-200 text-sm text-clay-800">
      <p className="font-medium mb-2">
        {descartadas.length} asignación(es) se ignoraron porque ya no son válidas:
      </p>
      <ul className="space-y-1 text-clay-700">
        {descartadas.map((d, i) => (
          <li key={i}>
            · {d.profesorNombre} — {d.grupoNombre === 'Actividad' ? 'una actividad que ya no existe' : `${mapaMaterias[d.materiaId] || '—'} con ${d.grupoNombre}`}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-clay-600">
        Si esto es un error, revisá la malla curricular de ese año, la lista de actividades, o quitá/ajustá la asignación del profesor.
      </p>
    </div>
  )
}

function calcularHuecosMalla({ profesores, grupos, mallas, mapaMaterias }) {
  // total[grupoId][materiaId] = lecciones ya asignadas a algún profesor.
  // Las actividades no tienen grupoId, así que nunca entran acá.
  const totalAsignado = {}
  profesores.forEach(p => {
    (p.asignaciones || []).forEach(a => {
      if (a.esActividad || !a.grupoId) return
      totalAsignado[a.grupoId] ??= {}
      totalAsignado[a.grupoId][a.materiaId] = (totalAsignado[a.grupoId][a.materiaId] || 0) + (Number(a.leccionesPorSemana) || 0)
    })
  })

  const huecos = []
  grupos.forEach(g => {
    const filasMalla = mallas[g.anio] || []
    filasMalla.forEach(fila => {
      const requerido = Number(fila.leccionesPorSemana) || 0
      const asignado = totalAsignado[g.id]?.[fila.materiaId] || 0
      if (asignado !== requerido) {
        huecos.push({
          grupoNombre: g.nombre,
          materiaNombre: mapaMaterias[fila.materiaId] || '—',
          requerido,
          asignado,
        })
      }
    })
  })
  return huecos
}

function AvisoHuecosMalla({ huecos }) {
  return (
    <div className="mb-6 px-4 py-3 rounded-md bg-clay-50 border border-clay-200 text-sm text-clay-800">
      <p className="font-medium mb-2">{huecos.length} materia(s) no coinciden con la malla curricular:</p>
      <ul className="space-y-1 text-clay-700">
        {huecos.map((h, i) => (
          <li key={i}>
            · {h.grupoNombre} — {h.materiaNombre}: asignado {h.asignado} de {h.requerido} lecc./sem.
            {h.asignado < h.requerido ? ' (falta profesor o lecciones)' : ' (hay de más)'}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-clay-600">
        Revisalo en «Profesores» o «Malla curricular» antes de generar, o generá igual y ajustá después.
      </p>
    </div>
  )
}

// Agrupa los avisos de hueco de profesor por profesor+día, para mostrar
// "Prof. X — lunes: lecciones 3°, 4°" en una sola línea en vez de una
// línea por cada bloque suelto del mismo hueco.
function agruparAvisosPorProfesorDia(avisos) {
  const grupos = []
  const indice = {} // `${profesorId}|${dia}` -> índice en `grupos`
  avisos.forEach(a => {
    const clave = `${a.profesorId}|${a.dia}`
    if (!(clave in indice)) {
      indice[clave] = grupos.length
      grupos.push({ profesorNombre: a.profesorNombre, dia: a.dia, bloques: [] })
    }
    grupos[indice[clave]].bloques.push(a.bloqueNumero)
  })
  return grupos
}

function AvisoHuecosProfesor({ avisos }) {
  const agrupados = agruparAvisosPorProfesorDia(avisos)
  return (
    <div className="mb-6 px-4 py-3 rounded-md bg-ink-50 border border-ink-200 text-sm text-ink-700">
      <p className="font-medium mb-2 text-ink-800">
        {agrupados.length} profesor(es) con un hueco entre dos de sus clases:
      </p>
      <ul className="space-y-1 text-ink-600">
        {agrupados.map((g, i) => (
          <li key={i}>
            · {g.profesorNombre} — {DIAS_LABEL[g.dia]}: lección{g.bloques.length > 1 ? 'es' : ''} {g.bloques.join(', ')}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-500">
        Esta regla es deseable pero no obligatoria — el generador la respeta solo cuando no afecta la malla de ningún grupo. Si querés, podés ajustarlo a mano en la vista «Por profesor».
      </p>
    </div>
  )
}

function ResumenGeneracion({ horario, mapaProfesores, mapaGrupos, mapaMaterias, mapaActividades }) {
  const hayConflictos = horario.conflictos?.length > 0
  return (
    <div className={`mb-6 px-4 py-3 rounded-md border text-sm ${hayConflictos ? 'bg-clay-50 border-clay-200 text-clay-800' : 'bg-sage-50 border-sage-200 text-sage-800'}`}>
      {hayConflictos ? (
        <div>
          <p className="font-medium mb-2">{horario.conflictos.length} problema(s) encontrados al generar:</p>
          <ul className="space-y-1 text-clay-700">
            {horario.conflictos.map((c, i) => (
              <li key={i}>
                {c.profesorId
                  ? `· ${mapaProfesores[c.profesorId] || '—'} — ${c.esActividad ? (mapaActividades[c.actividadId] || 'Actividad') : (mapaMaterias[c.materiaId] || '—')}${c.grupoId ? ` con ${mapaGrupos[c.grupoId] || '—'}` : ''}`
                  : `· ${mapaGrupos[c.grupoId] || c.grupoId} — ${c.motivo}`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Todas las lecciones se ubicaron sin choques de horario.</p>
      )}
    </div>
  )
}

function TablaHorario({ bloques, asignaciones, modo, idSeleccionado, mapaMaterias, mapaActividades, mapaGrupos, mapaProfesores, editable, onSoltar }) {
  const [arrastrando, setArrastrando] = useState(null) // la asignación que se está arrastrando
  const [sobreCelda, setSobreCelda] = useState(null) // `${dia}|${bloqueId}` sobre la que está pasando el arrastre

  function celda(dia, bloqueId) {
    return asignaciones.find(a => {
      if (a.dia !== dia || a.bloqueId !== bloqueId) return false
      return modo === 'profesor' ? a.profesorId === idSeleccionado : a.grupoId === idSeleccionado
    })
  }

  function manejarDragStart(asignacion) {
    if (!editable) return
    setArrastrando(asignacion)
  }

  function manejarDragOver(e, dia, bloqueId) {
    if (!editable || !arrastrando) return
    e.preventDefault()
    setSobreCelda(`${dia}|${bloqueId}`)
  }

  function manejarDrop(e, dia, bloqueId) {
    if (!editable || !arrastrando) return
    e.preventDefault()
    setSobreCelda(null)
    const origen = arrastrando
    setArrastrando(null)
    if (origen.dia === dia && origen.bloqueId === bloqueId) return // soltó en el mismo lugar
    onSoltar(origen, { dia, bloqueId })
  }

  return (
    <Card className="overflow-hidden overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
            <th className="px-3 py-2.5 text-left font-semibold w-40">Hora</th>
            <th className="px-3 py-2.5 text-left font-semibold w-12">Lecc.</th>
            {DIAS.map(d => (
              <th key={d} className="px-3 py-2.5 text-left font-semibold">{DIAS_LABEL[d]}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {bloques.map(b => {
            if (b.tipo !== 'clase') {
              return (
                <tr key={b.id} className="stripe-bg bg-ink-50">
                  <td className="px-3 py-2 text-ink-400 text-xs whitespace-nowrap">{b.horaInicio} – {b.horaFin}</td>
                  <td colSpan={DIAS.length + 1} className="px-3 py-2 text-center text-ink-500 font-medium text-xs uppercase tracking-wide">
                    {b.etiqueta}
                  </td>
                </tr>
              )
            }
            return (
              <tr key={b.id}>
                <td className="px-3 py-2 text-ink-400 text-xs whitespace-nowrap">{b.horaInicio} – {b.horaFin}</td>
                <td className="px-3 py-2 text-ink-600 font-semibold">{b.numero}</td>
                {DIAS.map(dia => {
                  const a = celda(dia, b.id)
                  const claveCelda = `${dia}|${b.id}`
                  const esDestinoActivo = editable && arrastrando && sobreCelda === claveCelda
                  const esActividad = a?.esActividad
                  return (
                    <td
                      key={dia}
                      className={`px-3 py-2 align-top transition-colors ${esDestinoActivo ? 'bg-sage-100 ring-1 ring-inset ring-sage-400' : ''}`}
                      onDragOver={e => manejarDragOver(e, dia, b.id)}
                      onDragLeave={() => setSobreCelda(prev => (prev === claveCelda ? null : prev))}
                      onDrop={e => manejarDrop(e, dia, b.id)}
                    >
                      {a ? (
                        <div
                          draggable={editable && !esActividad}
                          onDragStart={() => manejarDragStart(a)}
                          onDragEnd={() => { setArrastrando(null); setSobreCelda(null) }}
                          className={editable && !esActividad ? 'cursor-grab active:cursor-grabbing rounded-md px-1.5 py-1 -mx-1.5 -my-1 hover:bg-ink-50 transition-colors' : ''}
                        >
                          <p className={`font-medium ${esActividad ? 'text-clay-700 italic' : 'text-ink-900'}`}>
                            {esActividad ? (mapaActividades[a.actividadId] || 'Actividad') : mapaMaterias[a.materiaId]}
                          </p>
                          <p className="text-xs text-ink-400">
                            {modo === 'profesor' ? (esActividad ? 'Actividad del colegio' : mapaGrupos[a.grupoId]) : mapaProfesores[a.profesorId]}
                          </p>
                        </div>
                      ) : (
                        <span className="text-ink-200">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
