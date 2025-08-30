import { tick } from 'svelte';

/**
 * Portal action - renders content in a different DOM location
 */
export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
  let targetElement: HTMLElement;
  
  function update(newTarget: HTMLElement | string) {
    if (typeof newTarget === 'string') {
      targetElement = document.querySelector(newTarget) || document.body;
    } else {
      targetElement = newTarget || document.body;
    }
    
    if (targetElement && node.parentNode !== targetElement) {
      targetElement.appendChild(node);
    }
  }
  
  function destroy() {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }
  
  update(target);
  
  return {
    update,
    destroy
  };
}