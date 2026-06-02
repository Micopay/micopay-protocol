export const errorMessages = {
  network: {
    offline: {
      title: 'Sin conexión',
      message: 'No pudimos conectarnos. Revisa tu señal e intenta otra vez.',
      action: 'Vuelve a intentar cuando tengas señal.',
      fundsSafe: true,
    },
    unavailable: {
      title: 'Servicio no disponible',
      message: 'El servicio está ocupado o en mantenimiento. Intenta de nuevo en unos minutos.',
      action: 'Espera un momento y vuelve a intentarlo.',
      fundsSafe: true,
    },
    timeout: {
      title: 'Tiempo de espera agotado',
      message: 'La operación tardó demasiado y no se pudo terminar a tiempo.',
      action: 'Intenta otra vez. Tus fondos siguen protegidos.',
      fundsSafe: true,
    },
  },
  auth: {
    invalidCredentials: {
      title: 'Datos incorrectos',
      message: 'El usuario o la clave no coinciden.',
      action: 'Revisa tus datos e inténtalo de nuevo.',
      fundsSafe: true,
    },
    sessionExpired: {
      title: 'Sesión vencida',
      message: 'Tu sesión terminó por seguridad.',
      action: 'Vuelve a entrar para seguir usando la app.',
      fundsSafe: true,
    },
    unauthorized: {
      title: 'No tienes acceso',
      message: 'No puedes ver esta información con esa cuenta.',
      action: 'Entra con la cuenta correcta o pide acceso.',
      fundsSafe: true,
    },
  },
  financial: {
    conflict: {
      title: 'La operación ya cambió',
      message: 'Otra persona movió esta operación antes que tú.',
      action: 'Actualiza la pantalla y revisa el estado.',
      fundsSafe: true,
    },
    insufficientFunds: {
      title: 'Saldo insuficiente',
      message: 'No tienes saldo suficiente para completar esta operación.',
      action: 'Prueba con un monto menor o recarga saldo.',
      fundsSafe: true,
    },
    failed: {
      title: 'No se pudo completar',
      message: 'La operación no pudo terminarse.',
      action: 'Intenta otra vez. Tus fondos no se pierden.',
      fundsSafe: true,
    },
    cancelled: {
      title: 'Operación cancelada',
      message: 'La operación se canceló antes de terminar.',
      action: 'Puedes iniciar una nueva operación cuando quieras.',
      fundsSafe: true,
    },
  },
  escrow: {
    unavailable: {
      title: 'Garantía no disponible',
      message: 'No pudimos preparar la garantía en este momento.',
      action: 'Vuelve a intentarlo. Tu saldo sigue protegido.',
      fundsSafe: true,
    },
    releasePending: {
      title: 'Liberación en proceso',
      message: 'La garantía todavía está esperando la siguiente confirmación.',
      action: 'Espera unos minutos o revisa el historial.',
      fundsSafe: true,
    },
  },
  qr: {
    invalid: {
      title: 'Código no válido',
      message: 'El código no se puede leer o ya no sirve.',
      action: 'Pide un código nuevo y vuelve a escanearlo.',
      fundsSafe: true,
    },
    cameraDenied: {
      title: 'Cámara no disponible',
      message: 'No se permitió usar la cámara.',
      action: 'Activa el permiso y vuelve a intentarlo.',
      fundsSafe: true,
    },
    scanFailed: {
      title: 'No se pudo completar el escaneo',
      message: 'No logramos terminar la lectura del QR.',
      action: 'Ajusta la cámara e inténtalo de nuevo.',
      fundsSafe: true,
    },
    expired: {
      title: 'Código vencido',
      message: 'Ese código ya expiró.',
      action: 'Genera uno nuevo para seguir.',
      fundsSafe: true,
    },
    unreadable: {
      title: 'No pudimos leer el código',
      message: 'La cámara no logró leer el código.',
      action: 'Ajusta la cámara o intenta con más luz.',
      fundsSafe: true,
    },
  },
  dispute: {
    pending: {
      title: 'Disputa en curso',
      message: 'Tu caso todavía está siendo revisado.',
      action: 'Espera la respuesta del equipo de soporte.',
      fundsSafe: true,
    },
    resolved: {
      title: 'Disputa resuelta',
      message: 'La disputa ya fue cerrada.',
      action: 'Revisa el historial para ver el resultado.',
      fundsSafe: true,
    },
  },
  refund: {
    pending: {
      title: 'Reembolso en proceso',
      message: 'El reembolso todavía está en camino.',
      action: 'Espera a que la red confirme el movimiento.',
      fundsSafe: true,
    },
    failed: {
      title: 'No se pudo hacer el reembolso',
      message: 'El reembolso no pudo completarse por ahora.',
      action: 'Intenta más tarde o contacta soporte.',
      fundsSafe: true,
    },
  },
  generic: {
    fallback: {
      title: 'Algo salió mal',
      message: 'No pudimos terminar esta acción. Intenta de nuevo.',
      action: 'Si el problema sigue, contacta soporte.',
      fundsSafe: true,
    },
  },
};
