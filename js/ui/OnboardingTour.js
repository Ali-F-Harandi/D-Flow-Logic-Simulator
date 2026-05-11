/**
 * OnboardingTour.js — 3-step guided tour for first-time users
 *
 * Shows a lightweight modal overlay with step-by-step instructions:
 *   Step 1: "Drag a component from the sidebar"
 *   Step 2: "Click and drag between connectors to wire"
 *   Step 3: "Press Run to simulate"
 *
 * Persists `dflow-has-seen-tour` in localStorage so it only shows once.
 */

import { icon, replaceIcons } from '../utils/IconHelper.js';

export class OnboardingTour {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.steps = [
      {
        title: 'Welcome to D-Flow!',
        description: 'Build digital logic circuits by dragging components and connecting them with wires. Let\'s get started!',
        lucideIcon: 'zap'
      },
      {
        title: 'Step 1: Add a Component',
        description: 'Click the hamburger menu to open the sidebar, then drag a gate onto the canvas. Try an AND gate!',
        lucideIcon: 'mouse-pointer'
      },
      {
        title: 'Step 2: Connect with Wires',
        description: 'Click on an output connector (dot) and drag to an input connector to create a wire. The wire will auto-route using A* pathfinding!',
        lucideIcon: 'link'
      },
      {
        title: 'Step 3: Run the Simulation',
        description: 'Press the Run button in the header to start the simulation. Toggle switches and watch signals propagate through your circuit!',
        lucideIcon: 'play'
      }
    ];
    this.currentStep = 0;
    this.overlay = null;

    // Check if tour should be shown
    if (!localStorage.getItem('dflow-has-seen-tour')) {
      // Delay to let the app render
      setTimeout(() => this.show(), 800);
    }
  }

  show() {
    this.currentStep = 0;
    this._render();
  }

  _render() {
    // Remove existing overlay
    if (this.overlay) this.overlay.remove();

    const step = this.steps[this.currentStep];

    this.overlay = document.createElement('div');
    this.overlay.className = 'onboarding-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Getting started tour');

    const card = document.createElement('div');
    card.className = 'onboarding-card';

    // Icon — using lucide instead of emoji
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = 'font-size: 32px; margin-bottom: 8px; color: var(--color-accent, #007acc); display: flex; align-items: center; justify-content: center;';
    iconDiv.innerHTML = icon(step.lucideIcon, '', { size: 32 });
    replaceIcons(iconDiv);

    // Title
    const title = document.createElement('h3');
    title.textContent = step.title;

    // Description
    const desc = document.createElement('p');
    desc.textContent = step.description;

    // Step indicator dots
    const dots = document.createElement('div');
    dots.className = 'onboarding-step-indicator';
    for (let i = 0; i < this.steps.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'onboarding-dot' + (i === this.currentStep ? ' active' : '');
      dots.appendChild(dot);
    }

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'onboarding-btn-row';

    // Skip button
    const skipBtn = document.createElement('button');
    skipBtn.className = 'onboarding-btn';
    skipBtn.textContent = 'Skip Tour';
    skipBtn.addEventListener('click', () => this._dismiss());

    // Next/Finish button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'onboarding-btn onboarding-btn-primary';
    nextBtn.textContent = this.currentStep === this.steps.length - 1 ? 'Get Started!' : 'Next →';
    nextBtn.addEventListener('click', () => this._next());

    btnRow.appendChild(skipBtn);
    btnRow.appendChild(nextBtn);

    card.appendChild(iconDiv);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(dots);
    card.appendChild(btnRow);
    this.overlay.appendChild(card);

    // Close on overlay click (outside card)
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this._dismiss();
    });

    document.body.appendChild(this.overlay);

    // Focus the next button for keyboard accessibility
    nextBtn.focus();
  }

  _next() {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this._dismiss();
    } else {
      this._render();
    }
  }

  _dismiss() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    localStorage.setItem('dflow-has-seen-tour', 'true');
  }
}
