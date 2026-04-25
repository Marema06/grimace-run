'use strict';

/**
 * Réseau de neurones feedforward simple
 * Utilisé pour le cerveau de chaque voiture
 * weights[i][j] = poids de neurone i vers neurone j de la couche suivante
 */
class NeuralNet {
  constructor(inputSize, hiddenSizes, outputSize, activation = 'tanh') {
    this.inputSize = inputSize;
    this.hiddenSizes = [...hiddenSizes];
    this.outputSize = outputSize;
    this.activation = activation;
    this.layers = [];
    this._initWeights();
  }

  _initWeights() {
    const sizes = [this.inputSize, ...this.hiddenSizes, this.outputSize];
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const fanIn = sizes[i];
      const fanOut = sizes[i + 1];
      const scale = Math.sqrt(2 / (fanIn + fanOut)); // initialisation Xavier
      const weights = Array.from({ length: fanIn }, () =>
        Array.from({ length: fanOut }, () => (Math.random() * 2 - 1) * scale)
      );
      const biases = new Array(fanOut).fill(0);
      this.layers.push({ weights, biases });
    }
  }

  _activate(x) {
    switch (this.activation) {
      case 'relu':    return Math.max(0, x);
      case 'sigmoid': return 1 / (1 + Math.exp(-x));
      default:        return Math.tanh(x);
    }
  }

  predict(inputs) {
    let current = [...inputs];
    for (const { weights, biases } of this.layers) {
      const next = [];
      for (let j = 0; j < biases.length; j++) {
        let sum = biases[j];
        for (let i = 0; i < current.length; i++) sum += current[i] * weights[i][j];
        next.push(this._activate(sum));
      }
      current = next;
    }
    return current;
  }

  copy() {
    const c = new NeuralNet(this.inputSize, this.hiddenSizes, this.outputSize, this.activation);
    c.layers = this.layers.map(({ weights, biases }) => ({
      weights: weights.map(row => [...row]),
      biases: [...biases]
    }));
    return c;
  }

  mutate(rate, strength) {
    for (const { weights, biases } of this.layers) {
      for (const row of weights) {
        for (let j = 0; j < row.length; j++) {
          if (Math.random() < rate) {
            row[j] += (Math.random() * 2 - 1) * strength;
            row[j] = Math.max(-5, Math.min(5, row[j]));
          }
        }
      }
      for (let j = 0; j < biases.length; j++) {
        if (Math.random() < rate) {
          biases[j] += (Math.random() * 2 - 1) * strength;
          biases[j] = Math.max(-5, Math.min(5, biases[j]));
        }
      }
    }
  }

  // Croisement de deux cerveaux (enfant hérite de l'un ou l'autre)
  crossover(other) {
    const child = this.copy();
    for (let l = 0; l < child.layers.length; l++) {
      for (let i = 0; i < child.layers[l].weights.length; i++) {
        for (let j = 0; j < child.layers[l].weights[i].length; j++) {
          if (Math.random() < 0.5) {
            child.layers[l].weights[i][j] = other.layers[l].weights[i][j];
          }
        }
      }
    }
    return child;
  }

  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSizes: this.hiddenSizes,
      outputSize: this.outputSize,
      activation: this.activation,
      layers: this.layers
    };
  }

  static fromJSON(data) {
    const nn = new NeuralNet(data.inputSize, data.hiddenSizes, data.outputSize, data.activation);
    nn.layers = data.layers.map(({ weights, biases }) => ({
      weights: weights.map(row => [...row]),
      biases: [...biases]
    }));
    return nn;
  }
}
