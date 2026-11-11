import type { Catalogue, Widen } from "../en";

export const security: Widen<Catalogue["security"]> = {
  off: "Desligado",
  on: "Ligado",
  lock: {
    title: "A Wallt está bloqueada",
    wrongPin: "PIN errado",
    blocked: "Demasiadas tentativas. Aguarde.",
    retryIn: "Tente novamente dentro de {{seconds}} s",
    prompt: "Introduza o seu PIN para continuar",
    biometrics: "Usar impressão digital ou rosto",
  },
  pad: {
    digitsEntered_one: "{{count}} dígito introduzido",
    digitsEntered_other: "{{count}} dígitos introduzidos",
    delete: "Apagar",
    confirm: "Confirmar PIN",
  },
  privacyToggle: {
    show: "Mostrar valores",
    hide: "Ocultar valores",
  },
  pinSheet: {
    invalidLength: "Use 4 a 8 dígitos",
    mismatch: "Os dois PINs não coincidem",
    newLabel: "Novo PIN (4 a 8 dígitos)",
    pinLabel: "PIN",
    repeat: "Repetir PIN",
    continue: "Continuar",
    cancel: "Cancelar",
  },
  privacy: {
    title: "Modo de privacidade",
    hint: "Substitui todos os valores por pontos. Útil em locais públicos; também pode alternar com o olho no cabeçalho da página.",
  },
  appLock: {
    title: "Bloqueio da app",
    unsupported:
      "Disponível na app Android. Na web, o seu navegador e o início de sessão do dispositivo protegem a sessão.",
    hint: "Pedir o PIN ao abrir a Wallt depois de ter estado em segundo plano.",
    hintBiometrics:
      "Pedir o PIN ou a impressão digital/rosto ao abrir a Wallt depois de ter estado em segundo plano.",
    lockAfter: "Bloquear a app",
    autoLock: {
      immediately: "Imediatamente",
      min1: "Após 1 minuto",
      min5: "Após 5 minutos",
      min15: "Após 15 minutos",
    },
    biometricsLabel: "Impressão digital ou rosto",
    changePin: "Alterar PIN",
    choosePin: "Escolha um PIN",
    disableTitle: "Introduza o PIN para desativar o bloqueio",
    currentPin: "Introduza o PIN atual",
    chooseNewPin: "Escolha um novo PIN",
    enabled: "O bloqueio da app está ativado",
    disabled: "O bloqueio da app está desativado",
    pinChanged: "PIN alterado",
    saveFailed: "Não foi possível guardar o PIN",
    genericError: "Algo correu mal",
  },
};
