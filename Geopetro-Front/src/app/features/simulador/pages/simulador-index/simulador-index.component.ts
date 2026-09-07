import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface SimCard {
  title: string;
  description: string;
  icon: string;
  route: string[];
}

@Component({
  selector: 'app-simulador-index',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './simulador-index.component.html',
  styleUrl: './simulador-index.component.css',
})
export class SimuladorIndexComponent {
  readonly cards: SimCard[] = [
    {
      title: 'Squeeze',
      description:
        'Simulador de squeeze para correção de cimentação e vedação de zonas permeáveis.',
      icon: '💉',
      route: ['squeeze'],
    },
    {
      title: 'Tampão',
      description:
        'Simulador de tampão de cimento para abandono ou isolamento de zonas.',
      icon: '🧱',
      route: ['tampao'],
    },
  ];
}
