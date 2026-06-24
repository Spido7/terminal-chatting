export const state = {
  alias: '',
  token: '',
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

/**
 * Set the user's authentication token
 * @param {string} token 
 */
export function setToken(token) {
  state.token = token ? token.trim() : '';
}

/**
 * Get the user's authentication token
 * @returns {string}
 */
export function getToken() {
  return state.token;
}
