// ========================================================================
// GENERADOR DE HORARIOS
// ------------------------------------------------------------------------
// Idea central: en un colegio real, las lecciones de una materia casi
// nunca se ubican sueltas una por una. Se agrupan en "bloques dobles"
// (2 lecciones seguidas, el mismo día) cuando la cantidad lo permite, y
// el resto queda en lecciones sueltas. Por eso el generador no coloca
// "lecciones individuales": primero arma la lista de UNIDADES a ubicar
// (dobles, sueltas, o continuas) para cada profesor+grupo+materia, y
// después ubica cada unidad completa en el horario.
//
// 1. Por cada asignación (profesor, grupo, materia, leccionesPorSemana,
//    bloqueContinuo) se generan unidades:
//      - Si bloqueContinuo es true: UNA sola unidad de tipo 'continua'
//        que ocupa TODAS las lecciones de la semana, seguidas, el mismo
//        día (ej: Tecnología con 6 lecciones -> 1 unidad de 6 bloques
//        consecutivos, sin recreo en medio). No se permite partirla.
//      - Si no: tantos bloques dobles como sea posible, más una suelta
//        si la cantidad es impar.
//          Ej: 6 lecciones -> 3 unidades dobles.
//          Ej: 5 lecciones -> 2 unidades dobles + 1 suelta.
// 2. Las unidades se ordenan de la más restringida a la menos (menos
//    días disponibles primero), y dentro de eso, las continuas y dobles
//    antes que las sueltas (son más difíciles de encajar).
// 3. Para cada unidad se buscan tramos de bloques consecutivos (según su
//    tamaño: 1 para suelta, 2 para doble, N para continua) en cada día,
//    respetando:
//      - Un profesor no puede estar en 2 lugares a la vez.
//      - Un grupo no puede tener 2 materias a la vez.
//      - El profesor no trabaja ese día -> bloqueado.
//      - Solo se usan bloques de tipo 'clase', consecutivos en la
//        grilla (sin un recreo/almuerzo en medio que los separe).
//      - La misma materia+grupo no se repite el mismo día salvo que
//        sea, precisamente, la propia unidad (que ya ocupa varios
//        bloques de ese día a la vez).
// 4. Restricciones blandas (se intentan, no obligatorias): bloques
//    preferidos / evitados del profesor, y modo de reparto cuando la
//    cantidad es impar ('parejo' = repartir la suelta en un día con
//    poca carga; 'temprano' = concentrar para que un día puntual salga
//    antes, sin pasar nunca de cierto límite de lecciones diarias).
// 5. Si una unidad no logra ubicarse, se reporta como conflicto y se
//    sigue con las demás, sin trabar el resto del horario. Una unidad
//    'continua' que no encuentra ningún día con suficientes bloques
//    seguidos libres se reporta completa como conflicto (no se parte).
// ========================================================================

function construirUnidades(profesores) {
  const unidades = []
  for (const prof of profesores) {
    const asignaciones = prof.asignaciones || []
    for (const asig of asignaciones) {
      const cantidad = Number(asig.leccionesPorSemana) || 0
      if (cantidad <= 0) continue

      const base = {
        profesorId: prof.id,
        profesorNombre: prof.nombre,
        grupoId: asig.grupoId,
        materiaId: asig.materiaId,
        diasNoTrabaja: prof.diasNoTrabaja || [],
        bloquesPreferidos: prof.bloquesPreferidos || [],
        bloquesEvitados: prof.bloquesEvitados || [],
      }

      if (asig.bloqueContinuo) {
        unidades.push({
          ...base,
          tipo: 'continua',
          cantidadBloques: cantidad,
          puedeAtravesarAlmuerzo: !!asig.puedeAtravesarAlmuerzo,
        })
        continue
      }

      const dobles = Math.floor(cantidad / 2)
      const sueltaExtra = cantidad % 2 === 1
      for (let i = 0; i < dobles; i++) {
        unidades.push({ ...base, tipo: 'doble', cantidadBloques: 2 })
      }
      if (sueltaExtra) {
        unidades.push({ ...base, tipo: 'suelta', cantidadBloques: 1 })
      }
    }
  }
  return unidades
}

// Identifica tramos de exactamente `tamano` bloques de tipo 'clase'
// (lecciones reales) en la grilla.
//
// - Si `permitirAtravesarRecreos` es false (caso normal: dobles y sueltas),
//   el tramo debe ser estrictamente consecutivo, sin nada en medio — el
//   comportamiento de siempre.
// - Si es true (caso de "bloque continuo", ej. Tecnología), se permite que
//   en el camino haya recreos (siempre se atraviesan, nunca cuentan como
//   interrupción) y, si `puedeAtravesarAlmuerzo` es true, también el bloque
//   de almuerzo. Cualquier otro corte (almuerzo no permitido) termina el
//   tramo ahí.
//
// Devuelve un array de tramos, cada uno como un array de exactamente
// `tamano` bloques de tipo 'clase' (los recreos/almuerzo atravesados no se
// incluyen en el resultado, porque no se "ocupan", solo se permite que
// estén en medio del tramo).
function construirTramosConsecutivos(bloquesTodos, tamano, permitirAtravesarRecreos = false, puedeAtravesarAlmuerzo = false) {
  if (!permitirAtravesarRecreos) {
    // Comportamiento estricto de siempre: ventana de `tamano` bloques
    // consecutivos en la grilla, todos de tipo 'clase'.
    const tramos = []
    for (let i = 0; i + tamano <= bloquesTodos.length; i++) {
      const candidato = bloquesTodos.slice(i, i + tamano)
      if (candidato.every(b => b.tipo === 'clase')) {
        tramos.push(candidato)
      }
    }
    return tramos
  }

  const tramos = []
  for (let inicio = 0; inicio < bloquesTodos.length; inicio++) {
    if (bloquesTodos[inicio].tipo !== 'clase') continue
    const leccionesDelTramo = []
    for (let i = inicio; i < bloquesTodos.length; i++) {
      const bloque = bloquesTodos[i]
      if (bloque.tipo === 'clase') {
        leccionesDelTramo.push(bloque)
        if (leccionesDelTramo.length === tamano) break
      } else if (bloque.tipo === 'recreo') {
        continue // los recreos siempre se pueden atravesar
      } else if (bloque.tipo === 'almuerzo' && puedeAtravesarAlmuerzo) {
        continue // el almuerzo se atraviesa solo si está permitido para esta materia
      } else {
        break // corte real: almuerzo no permitido, u otro tipo de bloque
      }
    }
    if (leccionesDelTramo.length === tamano) {
      tramos.push(leccionesDelTramo)
    }
  }
  return tramos
}

function calcularDisponibilidad(unidad, dias, bloquesClase) {
  const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
  return diasDisponibles.length * bloquesClase.length
}

function generarUnIntento({ profesores, dias, bloques, modoReparto, azar }) {
  const bloquesClase = bloques.filter(b => b.tipo === 'clase')

  // Cache de tramos consecutivos por (tamaño, si atraviesa recreos, si
  // atraviesa almuerzo), para no recalcularlos por cada unidad.
  const tramosPorClave = {}
  function tramosDeTamano(tamano, permitirAtravesarRecreos, puedeAtravesarAlmuerzo) {
    const clave = `${tamano}|${permitirAtravesarRecreos}|${puedeAtravesarAlmuerzo}`
    if (!tramosPorClave[clave]) {
      tramosPorClave[clave] = construirTramosConsecutivos(bloques, tamano, permitirAtravesarRecreos, puedeAtravesarAlmuerzo)
    }
    return tramosPorClave[clave]
  }

  let unidades = construirUnidades(profesores)

  // Ordenar: las unidades 'continua' SIEMPRE van primero, sin excepción
  // (restricción estructural, nunca se mezcla). Dentro de cada grupo
  // (continua vs. no-continua), ordenamos por disponibilidad real del
  // profesor (menos días libres primero), y dentro de ESO, agregamos un
  // desempate ALEATORIO (controlado por `azar`) en lugar de uno fijo —
  // esto permite que generarHorario() pruebe varios órdenes distintos en
  // sucesivos intentos y se quede con el que dé mejor resultado, en vez
  // de repetir siempre la misma distribución determinística.
  unidades = unidades
    .map(u => ({ ...u, disponibilidad: calcularDisponibilidad(u, dias, bloquesClase), _azar: azar() }))
    .sort((a, b) => {
      const aEsContinua = a.tipo === 'continua'
      const bEsContinua = b.tipo === 'continua'
      if (aEsContinua !== bEsContinua) return aEsContinua ? -1 : 1
      if (a.disponibilidad !== b.disponibilidad) return a.disponibilidad - b.disponibilidad
      if (a.cantidadBloques !== b.cantidadBloques) return b.cantidadBloques - a.cantidadBloques
      return a._azar - b._azar
    })

  const ocupacionProfesor = {}  // `${profId}|${dia}|${bloqueId}` -> true
  const ocupacionGrupo = {}     // `${grupoId}|${dia}|${bloqueId}` -> true
  const materiaGrupoDia = {}    // `${grupoId}|${materiaId}|${dia}` -> true
  const leccionesPorDiaGrupo = {} // `${grupoId}|${dia}` -> cantidad de lecciones ese día

  const asignaciones = []
  const conflictos = []

  function kProf(profId, dia, bloqueId) { return `${profId}|${dia}|${bloqueId}` }
  function kGrupo(grupoId, dia, bloqueId) { return `${grupoId}|${dia}|${bloqueId}` }
  function kMatDia(grupoId, materiaId, dia) { return `${grupoId}|${materiaId}|${dia}` }
  function kCargaDia(grupoId, dia) { return `${grupoId}|${dia}` }

  function colocar(unidad, dia, bloquesAOcupar) {
    for (const bloque of bloquesAOcupar) {
      ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)] = true
      ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)] = true
      asignaciones.push({
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        dia,
        bloqueId: bloque.id,
        _unidadTipo: unidad.tipo,
        _unidadPuedeAtravesarAlmuerzo: !!unidad.puedeAtravesarAlmuerzo,
      })
    }
    materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)] = true
    const k = kCargaDia(unidad.grupoId, dia)
    leccionesPorDiaGrupo[k] = (leccionesPorDiaGrupo[k] || 0) + bloquesAOcupar.length
  }

  function puntajeBloque(unidad, bloque) {
    let puntaje = 0
    if (unidad.bloquesPreferidos.includes(bloque.id)) puntaje += 10
    if (unidad.bloquesEvitados.includes(bloque.id)) puntaje -= 10
    return puntaje
  }

  // Genera las opciones (día, tramo de bloques) para una unidad, del
  // tamaño que sea (1 = suelta, 2 = doble, N = continua), ordenadas por
  // preferencia del profesor y por el modo de reparto.
  function opcionesParaUnidad(unidad) {
    const diasDisponibles = dias.filter(d => !unidad.diasNoTrabaja.includes(d))
    const esContinua = unidad.tipo === 'continua'
    const tramos = tramosDeTamano(unidad.cantidadBloques, esContinua, esContinua && unidad.puedeAtravesarAlmuerzo)
    const opciones = []
    for (const dia of diasDisponibles) {
      for (const tramo of tramos) {
        let puntaje = tramo.reduce((acc, b) => acc + puntajeBloque(unidad, b), 0)
        const carga = leccionesPorDiaGrupo[kCargaDia(unidad.grupoId, dia)] || 0
        if (modoReparto === 'parejo') {
          puntaje -= carga // preferir días con MENOS carga acumulada -> reparte parejo
        } else if (modoReparto === 'temprano') {
          puntaje += carga // preferir días con MÁS carga acumulada -> concentra, deja otros días libres
        }
        opciones.push({ dia, bloques: tramo, puntaje, _azar: azar() })
      }
    }
    opciones.sort((a, b) => (b.puntaje - a.puntaje) || (a._azar - b._azar))
    return opciones
  }

  function cabeSinChoque(unidad, dia, bloquesAOcupar, permitirRepetirMateriaDia) {
    for (const bloque of bloquesAOcupar) {
      if (ocupacionProfesor[kProf(unidad.profesorId, dia, bloque.id)]) return false
      if (ocupacionGrupo[kGrupo(unidad.grupoId, dia, bloque.id)]) return false
    }
    if (!permitirRepetirMateriaDia && materiaGrupoDia[kMatDia(unidad.grupoId, unidad.materiaId, dia)]) return false
    return true
  }

  function intentarUnidad(unidad) {
    const opciones = opcionesParaUnidad(unidad)

    // Primera pasada: sin permitir que la materia se repita el mismo día
    // (salvo que sea la propia unidad, que ocupa varios bloques del mismo
    // día a la vez — eso es válido porque es UNA sola unidad).
    for (const permitirRepetir of [false, true]) {
      for (const { dia, bloques: bloquesOpcion } of opciones) {
        if (cabeSinChoque(unidad, dia, bloquesOpcion, permitirRepetir)) {
          colocar(unidad, dia, bloquesOpcion)
          return true
        }
      }
    }
    return false
  }

  for (const unidad of unidades) {
    const ok = intentarUnidad(unidad)
    if (!ok) {
      const motivoPorTipo = {
        continua: `No se encontró un día con ${unidad.cantidadBloques} lecciones seguidas libres sin choques (la materia exige bloque continuo).`,
        doble: 'No se encontró un bloque doble (2 lecciones seguidas) libre sin choques.',
        suelta: 'No se encontró un bloque libre sin choques.',
      }
      conflictos.push({
        profesorId: unidad.profesorId,
        profesorNombre: unidad.profesorNombre,
        grupoId: unidad.grupoId,
        materiaId: unidad.materiaId,
        motivo: motivoPorTipo[unidad.tipo] || 'No se encontró un bloque libre sin choques.',
      })
    }
  }

  // ----------------------------------------------------------------------
  // FASE 2 — Compactar huecos: cada grupo, cada día, debe tener sus
  // lecciones ocupando un tramo ininterrumpido desde el primer bloque de
  // clase del día (puede terminar antes, pero nunca con un hueco en medio).
  // El generador de arriba no garantiza esto por sí solo, porque distintas
  // materias se van colocando una por una sin coordinarse entre sí. Acá
  // reparamos cualquier hueco que haya quedado, moviendo lecciones hacia
  // atrás. Un movimiento solo es válido si el profesor de esa lección
  // sigue libre en el nuevo horario (no puede chocar con otra clase que
  // ya tenga en otro grupo a esa hora). Si mover una lección directamente
  // no es posible, se intenta encadenar con otras lecciones del mismo
  // grupo+día que sí puedan moverse, antes de rendirse y dejar el hueco
  // (que se reporta como advertencia).
  const huecosNoReparables = compactarHuecos({
    bloques, bloquesClase, dias, grupos: [...new Set(unidades.map(u => u.grupoId))],
    asignaciones, ocupacionProfesor, ocupacionGrupo,
  })
  for (const h of huecosNoReparables) {
    conflictos.push({
      profesorId: null,
      profesorNombre: null,
      grupoId: h.grupoId,
      materiaId: null,
      motivo: `quedó un hueco sin clase el día ${h.dia} (lección ${h.bloqueNumero || h.bloqueId}) que no se pudo cerrar sin generar un choque de profesor.`,
    })
  }

  // Limpiar campos internos que solo se usaron para la compactación —
  // no deben quedar en el resultado final que se guarda/muestra.
  const asignacionesLimpias = asignaciones.map(({ _unidadTipo, _unidadPuedeAtravesarAlmuerzo, ...resto }) => resto)

  return {
    asignaciones: asignacionesLimpias,
    conflictos,
    generadoEn: new Date().toISOString(),
    completo: conflictos.length === 0,
  }
}

// Generador de números pseudoaleatorios con semilla, para que cada intento
// sea reproducible si se necesita depurar, pero distinto entre sí.
function crearAzar(semilla) {
  let estado = semilla
  return function azar() {
    estado = (estado * 1103515245 + 12345) & 0x7fffffff
    return estado / 0x7fffffff
  }
}

// ========================================================================
// Punto de entrada público. En vez de quedarse con el primer resultado que
// encuentra, corre varios intentos completos (generación + compactación),
// cada uno con un orden de colocación ligeramente distinto (aleatorización
// controlada en los desempates, sin tocar las restricciones duras), y se
// queda con el MEJOR resultado: el que tenga menos conflictos totales, y
// entre empates, el que tenga menos huecos de grupo sin reparar.
//
// Esto es deliberadamente más lento que generar una sola vez, a cambio de
// encontrar más a menudo una solución completa o, si no existe, la que
// deje la menor cantidad de problemas pendientes — tal como se pidió:
// priorizar la robustez del resultado por sobre la velocidad.
// ========================================================================
export function generarHorario({ profesores, dias, bloques, modoReparto = 'parejo', intentos = 40 }) {
  let mejorResultado = null
  let mejorPuntaje = Infinity

  for (let i = 0; i < intentos; i++) {
    const azar = crearAzar(i * 2654435761 + 1)
    const resultado = generarUnIntento({ profesores, dias, bloques, modoReparto, azar })

    // Puntaje del intento: cada conflicto "normal" (lección sin ubicar)
    // pesa 1, pero un hueco de grupo sin reparar pesa más, porque rompe
    // una regla estructural más visible/grave que una lección puntual.
    const huecos = resultado.conflictos.filter(c => !c.profesorId).length
    const otros = resultado.conflictos.length - huecos
    const puntaje = huecos * 3 + otros

    if (puntaje < mejorPuntaje) {
      mejorPuntaje = puntaje
      mejorResultado = resultado
    }

    if (puntaje === 0) break // ya es perfecto, no hace falta seguir probando
  }

  return mejorResultado
}

// Recorre cada grupo y cada día, y busca un REORDENAMIENTO válido de las
// lecciones de ese día tal que no quede ningún hueco en medio — ocupando
// exactamente los primeros N bloques de clase del día, EN UN ORDEN QUE
// SOLO USE POSICIONES REALMENTE VÁLIDAS PARA CADA UNIDAD.
//
// Esto es clave: una unidad doble normal (ej. Educación Física, 2
// lecciones) solo puede ocupar 2 bloques de clase que sean estrictamente
// consecutivos EN LA GRILLA REAL (sin un recreo de por medio) — nunca se
// le permite "saltar" un recreo, a diferencia de una unidad continua (ej.
// Tecnología), que sí puede atravesar recreos y, si está habilitado,
// también el almuerzo. Si no se respeta esto, se puede terminar con un
// par roto por un recreo en medio, que es exactamente el bug que se debía
// evitar.
//
// Primero se agrupan las asignaciones en "unidades móviles" (reconstruye
// los bloques dobles/continuos ya colocados en la fase 1, junto con su
// tipo original). Después, mediante backtracking, se prueba ubicar cada
// unidad pendiente en alguno de los TRAMOS VÁLIDOS de la grilla (no
// cualquier rango de índices), de forma que el conjunto ocupe exactamente
// los primeros N bloques de clase del día sin huecos.
function compactarHuecos({ bloques, bloquesClase, dias, grupos, asignaciones, ocupacionProfesor, ocupacionGrupo }) {
  function kProf(profId, dia, bloqueId) { return `${profId}|${dia}|${bloqueId}` }
  function kGrupo(grupoId, dia, bloqueId) { return `${grupoId}|${dia}|${bloqueId}` }

  // Cache de tramos válidos por (tamaño, tipo) para no recalcular.
  const tramosCache = {}
  function tramosValidosPara(tamano, esContinua, puedeAtravesarAlmuerzo) {
    const clave = `${tamano}|${esContinua}|${puedeAtravesarAlmuerzo}`
    if (!tramosCache[clave]) {
      tramosCache[clave] = construirTramosConsecutivos(bloques, tamano, esContinua, puedeAtravesarAlmuerzo)
    }
    return tramosCache[clave]
  }

  const huecosNoReparables = []

  // Agrupa las asignaciones de un grupo+día en unidades móviles: tramos de
  // lecciones consecutivas (según el orden real de bloquesClase) que
  // comparten profesor+materia+grupo. Conserva el tipo original (doble,
  // suelta, continua) y si puede atravesar almuerzo, para saber en qué
  // tramos puede reubicarse.
  function agruparEnUnidadesMoviles(asignacionesDelDia) {
    const porBloqueId = {}
    asignacionesDelDia.forEach(a => { porBloqueId[a.bloqueId] = a })

    const unidades = []
    let unidadActual = null
    for (const bloque of bloquesClase) {
      const asig = porBloqueId[bloque.id]
      if (!asig) { unidadActual = null; continue }
      const mismaUnidad = unidadActual
        && unidadActual.profesorId === asig.profesorId
        && unidadActual.materiaId === asig.materiaId
        && unidadActual.grupoId === asig.grupoId
        && unidadActual.esContinua === (asig._unidadTipo === 'continua')
      if (mismaUnidad) {
        unidadActual.asignacionesOrdenadas.push(asig)
        unidadActual.tamano++
      } else {
        unidadActual = {
          profesorId: asig.profesorId,
          materiaId: asig.materiaId,
          grupoId: asig.grupoId,
          tamano: 1,
          esContinua: asig._unidadTipo === 'continua',
          puedeAtravesarAlmuerzo: !!asig._unidadPuedeAtravesarAlmuerzo,
          asignacionesOrdenadas: [asig],
        }
        unidades.push(unidadActual)
      }
    }
    return unidades
  }

  for (const grupoId of grupos) {
    for (const dia of dias) {
      const asignacionesDelDia = asignaciones.filter(a => a.grupoId === grupoId && a.dia === dia)
      if (asignacionesDelDia.length === 0) continue

      const cantidad = asignacionesDelDia.length
      const bloquesObjetivo = bloquesClase.slice(0, cantidad) // los primeros N bloques de clase, sin huecos

      const idsObjetivo = new Set(bloquesObjetivo.map(b => b.id))
      const yaCompacto = asignacionesDelDia.every(a => idsObjetivo.has(a.bloqueId))
      if (yaCompacto) continue

      const unidadesMoviles = agruparEnUnidadesMoviles(asignacionesDelDia)

      // Para cada unidad, precalculamos los tramos válidos (según su tipo)
      // que caen DENTRO de los bloquesObjetivo (los primeros N del día) —
      // porque solo nos interesa compactar dentro de ese rango.
      const idsObjetivoOrdenados = bloquesObjetivo.map(b => b.id)
      function tramosDentroDelObjetivo(unidad) {
        const todos = tramosValidosPara(unidad.tamano, unidad.esContinua, unidad.puedeAtravesarAlmuerzo)
        return todos.filter(tramo => tramo.every(b => idsObjetivoOrdenados.includes(b.id)))
      }

      // Liberamos temporalmente la ocupación de este grupo+día.
      for (const a of asignacionesDelDia) {
        delete ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)]
        delete ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)]
      }

      const pendientes = [...unidadesMoviles]
      // ocupacionPorBloqueObjetivo: bloqueId -> true si ya fue asignado en este intento
      const asignacionTramo = {} // bloqueId -> { unidad, bloquesDestino } (solo en el bloque inicial del tramo)
      const ocupadoLocal = new Set()

      function backtrack() {
        // Buscar la primera posición (en orden de bloquesObjetivo) que
        // todavía no esté ocupada en este intento.
        const primerLibre = bloquesObjetivo.find(b => !ocupadoLocal.has(b.id))
        if (!primerLibre) return true // todo el objetivo quedó cubierto, éxito

        for (let i = 0; i < pendientes.length; i++) {
          const unidad = pendientes[i]
          if (!unidad) continue

          const tramos = tramosDentroDelObjetivo(unidad)
          for (const tramo of tramos) {
            if (tramo[0].id !== primerLibre.id) continue // debe empezar justo en el primer hueco libre
            if (tramo.some(b => ocupadoLocal.has(b.id))) continue // se solaparía con algo ya puesto

            const claves = tramo.map(b => kProf(unidad.profesorId, dia, b.id))
            if (claves.some(k => ocupacionProfesor[k])) continue // choque con otro grupo

            claves.forEach(k => { ocupacionProfesor[k] = true })
            tramo.forEach(b => ocupadoLocal.add(b.id))
            asignacionTramo[primerLibre.id] = { unidad, bloquesDestino: tramo }
            pendientes[i] = null

            if (backtrack()) return true

            // deshacer
            claves.forEach(k => { delete ocupacionProfesor[k] })
            tramo.forEach(b => ocupadoLocal.delete(b.id))
            delete asignacionTramo[primerLibre.id]
            pendientes[i] = unidad
          }
        }
        return false
      }

      const exito = backtrack()

      if (exito) {
        for (const entrada of Object.values(asignacionTramo)) {
          const { unidad, bloquesDestino } = entrada
          unidad.asignacionesOrdenadas.forEach((asig, k) => {
            asig.bloqueId = bloquesDestino[k].id
          })
          bloquesDestino.forEach(b => {
            ocupacionGrupo[kGrupo(grupoId, dia, b.id)] = true
          })
        }
      } else {
        // No se encontró ningún reordenamiento válido sin choques: se
        // restauran las posiciones originales.
        for (const a of asignacionesDelDia) {
          ocupacionProfesor[kProf(a.profesorId, dia, a.bloqueId)] = true
          ocupacionGrupo[kGrupo(a.grupoId, dia, a.bloqueId)] = true
        }
        const ocupados = new Set(asignacionesDelDia.map(a => a.bloqueId))
        for (let i = 0; i < bloquesClase.length; i++) {
          if (ocupados.has(bloquesClase[i].id)) continue
          const hayClaseDespues = bloquesClase.slice(i + 1).some(b => ocupados.has(b.id))
          if (hayClaseDespues) {
            huecosNoReparables.push({ grupoId, dia, bloqueId: bloquesClase[i].id, bloqueNumero: bloquesClase[i].numero })
            break
          }
        }
      }
    }
  }

  return huecosNoReparables
}
