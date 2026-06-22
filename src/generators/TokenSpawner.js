/**
 * Places Actor tokens onto the active Foundry scene.
 * All coordinates are in canvas pixels.
 */
export class TokenSpawner {
  /**
   * Spawn one token for the given actor on the current scene.
   *
   * @param {Actor}  actor
   * @param {{ x?: number, y?: number, scene?: Scene }} options
   * @returns {Promise<TokenDocument>}
   */
  static async spawnActor(actor, options = {}) {
    const scene = options.scene ?? canvas?.scene;
    if (!scene) throw new Error('No active scene to place tokens on. View a scene first.');

    const gridSize = canvas?.grid?.size ?? 100;
    const tokenW   = (actor.prototypeToken?.width  ?? 1) * gridSize;
    const tokenH   = (actor.prototypeToken?.height ?? 1) * gridSize;

    // Centre the token on the given point; default to scene centre
    const cx = options.x ?? Math.floor(scene.width  / 2);
    const cy = options.y ?? Math.floor(scene.height / 2);

    const tokenData          = actor.prototypeToken.toObject();
    tokenData.x              = cx - Math.floor(tokenW / 2);
    tokenData.y              = cy - Math.floor(tokenH / 2);
    tokenData.actorId        = actor.id;
    tokenData.actorLink      = false;
    tokenData.disposition    = tokenData.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE;

    const [token] = await scene.createEmbeddedDocuments('Token', [tokenData]);
    return token;
  }

  /**
   * Spawn `count` copies of an actor, arranged in a row with one grid-cell spacing.
   *
   * @param {Actor}  actor
   * @param {number} count
   * @param {{ x?: number, y?: number, scene?: Scene }} options
   * @returns {Promise<TokenDocument[]>}
   */
  static async spawnGroup(actor, count, options = {}) {
    const scene    = options.scene ?? canvas?.scene;
    const gridSize = canvas?.grid?.size ?? 100;
    const tokenW   = (actor.prototypeToken?.width ?? 1) * gridSize;

    const tokens = [];
    for (let i = 0; i < count; i++) {
      const token = await this.spawnActor(actor, {
        ...options,
        x: (options.x ?? Math.floor((scene?.width ?? 2000) / 2)) + i * (tokenW + 4),
      });
      tokens.push(token);
    }
    return tokens;
  }
}
