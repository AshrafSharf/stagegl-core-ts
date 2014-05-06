///<reference path="../../_definitions.ts"/>

/**
 * @module away.pool
 */
module away.pool
{
	import StageGL						= away.base.StageGL;
	import TextureBase					= away.gl.TextureBase;

	/**
	 *
	 * @class away.pool.TextureDataBase
	 */
	export class TextureData implements ITextureData
	{
		public stageGL:StageGL;

		public texture:TextureBase;

		public textureProxy:away.textures.TextureProxyBase;

		public invalid:boolean;

		constructor(stageGL:away.base.IStage, textureProxy:away.textures.TextureProxyBase)
		{
			this.stageGL = stageGL;
			this.textureProxy = textureProxy;
		}

		/**
		 *
		 */
		public dispose()
		{
			this.texture.dispose();
			this.texture = null;
		}

		/**
		 *
		 */
		public invalidate()
		{
			this.invalid = true;
		}
	}
}