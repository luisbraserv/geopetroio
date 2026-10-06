// Build para Kubernetes: o nginx do proprio front faz proxy reverso,
// entao tudo e same-origin (caminhos relativos). Ver nginx.conf.
export const environment = {
  production: true,
  apiUrl: '',
  telemetriaUrl: '/telemetria',
  telemetriaDemoIdUnidade: null as string | null,
};
