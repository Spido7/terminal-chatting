export const state = {
  alias: '',
};

/**
 * Set the user's chosen alias
 * @param {string} alias 
 */
export function setAlias(alias) {
  state.alias = alias.trim();
}

/**
 * Get the user's current alias
 * @returns {string}
 */
export function getAlias() {
  return state.alias;
}
