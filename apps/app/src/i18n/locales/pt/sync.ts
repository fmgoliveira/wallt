import type { Catalogue, Widen } from "../en";

export const sync: Widen<Catalogue["sync"]> = {
  errors: {
    invalid_credentials: "Email ou palavra-passe errados.",
    invalid_code: "Esse código não funcionou. Experimente o seguinte da sua app de autenticação.",
    locked: "Demasiadas tentativas. Aguarde alguns minutos e tente novamente.",
    rate_limited: "Demasiadas tentativas deste dispositivo. Aguarde alguns minutos.",
    expired: "Demorou demasiado. Introduza novamente a palavra-passe.",
    offline: "Não foi possível contactar o servidor. Verifique o endereço e a ligação.",
    server: "O servidor respondeu com um erro.",
    generic: "Algo correu mal",
    enterServer: "Introduza o endereço do servidor (https://…).",
    enrolRequired:
      "Conclua primeiro a configuração da verificação em dois passos na app web do servidor e depois inicie sessão aqui.",
  },
  signIn: {
    titleCode: "Código de dois passos",
    titleServer: "Iniciar sessão no seu servidor",
    recoveryCode: "Código de recuperação",
    sixDigitCode: "Código de 6 dígitos",
    checking: "A verificar…",
    submit: "Iniciar sessão",
    useAuthenticator: "Usar código da app de autenticação",
    useRecovery: "Usar um código de recuperação",
    serverAddress: "Endereço do servidor",
    serverPlaceholder: "https://wallt.exemplo.com",
    email: "Email",
    password: "Palavra-passe",
    continue: "Continuar",
    cancel: "Cancelar",
    done: "Sessão iniciada. A sincronizar…",
  },
  settings: {
    title: "Sincronização",
    signedIn: "Sessão iniciada como {{email}} em {{server}}. {{status}}.",
    signedOut:
      "Mantenha este dispositivo em sintonia com o seu servidor e os seus outros dispositivos. Funciona offline; as alterações sincronizam quando voltar a ter ligação.",
    syncNow: "Sincronizar agora",
    signOut: "Terminar sessão neste dispositivo",
    signInToSync: "Iniciar sessão para sincronizar",
  },
  status: {
    syncNowLabel: "{{label}}. Sincronizar agora",
  },
};
