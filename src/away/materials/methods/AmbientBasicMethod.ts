///<reference path="../../_definitions.ts"/>

module away.materials
{
	import Stage									= away.base.Stage;
	import ContextGLMipFilter						= away.stagegl.ContextGLMipFilter;
	import ContextGLTextureFilter					= away.stagegl.ContextGLTextureFilter;
	import ContextGLWrapMode						= away.stagegl.ContextGLWrapMode;
	import IContextStageGL							= away.stagegl.IContextStageGL;
	import Texture2DBase							= away.textures.Texture2DBase;

	/**
	 * AmbientBasicMethod provides the default shading method for uniform ambient lighting.
	 */
	export class AmbientBasicMethod extends ShadingMethodBase
	{
		private _useTexture:boolean = false;
		private _texture:Texture2DBase;

		private _color:number = 0xffffff;
		private _alpha:number = 1;

		private _colorR:number = 1;
		private _colorG:number = 1;
		private _colorB:number = 1;

		private _ambient:number = 1;

		/**
		 * Creates a new AmbientBasicMethod object.
		 */
		constructor()
		{
			super();
		}

		/**
		 * @inheritDoc
		 */
		public iInitVO(shaderObject:ShaderObjectBase, methodVO:MethodVO)
		{
			methodVO.needsUV = this._useTexture;
		}

		/**
		 * The strength of the ambient reflection of the surface.
		 */
		public get ambient():number
		{
			return this._ambient;
		}

		public set ambient(value:number)
		{
			if (this._ambient == value)
				return;

			this._ambient = value;

			this.updateColor();
		}

		/**
		 * The colour of the ambient reflection of the surface.
		 */
		public get color():number
		{
			return this._color;
		}

		public set color(value:number)
		{
			if (this._color == value)
				return;

			this._color = value;

			this.updateColor();
		}

		/**
		 * The alpha component of the surface.
		 */
		public get alpha():number
		{
			return this._alpha;
		}

		public set alpha(value:number)
		{
			if (this._alpha == value)
				return;

			this._alpha = value;

			this.updateColor();
		}

		/**
		 * The bitmapData to use to define the diffuse reflection color per texel.
		 */
		public get texture():Texture2DBase
		{
			return this._texture;
		}

		public set texture(value:Texture2DBase)
		{

			var b:boolean = ( value != null );

			/* // ORIGINAL conditional
			 if (Boolean(value) != _useTexture ||
			 (value && _texture && (value.hasMipmaps != _texture.hasMipmaps || value.format != _texture.format))) {
			 iInvalidateShaderProgram();
			 }
			 */
			if (b != this._useTexture || (value && this._texture && (value.hasMipmaps != this._texture.hasMipmaps || value.format != this._texture.format))) {
				this.iInvalidateShaderProgram();
			}
			this._useTexture = b;//Boolean(value);
			this._texture = value;
		}

		/**
		 * @inheritDoc
		 */
		public copyFrom(method:ShadingMethodBase)
		{
			var m:any = method;
			var b:AmbientBasicMethod = <AmbientBasicMethod> m;

			var diff:AmbientBasicMethod = b;//AmbientBasicMethod(method);

			this.ambient = diff.ambient;
			this.color = diff.color;
		}

		/**
		 * @inheritDoc
		 */
		public iGetFragmentCode(shaderObject:ShaderObjectBase, methodVO:MethodVO, targetReg:ShaderRegisterElement, registerCache:ShaderRegisterCache, sharedRegisters:ShaderRegisterData):string
		{
			var code:string = "";
			var ambientInputRegister:ShaderRegisterElement;

			if (this._useTexture) {
				ambientInputRegister = registerCache.getFreeTextureReg();

				methodVO.texturesIndex = ambientInputRegister.index;

				code += ShaderCompilerHelper.getTex2DSampleCode(targetReg, sharedRegisters, ambientInputRegister, this._texture, shaderObject.useSmoothTextures, shaderObject.repeatTextures, shaderObject.useMipmapping);

				if (shaderObject.alphaThreshold > 0) {
					var cutOffReg:ShaderRegisterElement = registerCache.getFreeFragmentConstant();
					methodVO.fragmentConstantsIndex = cutOffReg.index*4;

					code += "sub " + targetReg + ".w, " + targetReg + ".w, " + cutOffReg + ".x\n" +
						"kil " + targetReg + ".w\n" +
						"add " + targetReg + ".w, " + targetReg + ".w, " + cutOffReg + ".x\n";
				}

			} else {
				ambientInputRegister = registerCache.getFreeFragmentConstant();
				methodVO.fragmentConstantsIndex = ambientInputRegister.index*4;

				code += "mov " + targetReg + ", " + ambientInputRegister + "\n";
			}

			return code;
		}

		/**
		 * @inheritDoc
		 */
		public iActivate(shaderObject:ShaderObjectBase, methodVO:MethodVO, stage:Stage)
		{
			if (this._useTexture) {
				(<IContextStageGL> stage.context).setSamplerStateAt(methodVO.texturesIndex, shaderObject.repeatTextures? ContextGLWrapMode.REPEAT:ContextGLWrapMode.CLAMP, shaderObject.useSmoothTextures? ContextGLTextureFilter.LINEAR:ContextGLTextureFilter.NEAREST, shaderObject.useMipmapping? ContextGLMipFilter.MIPLINEAR:ContextGLMipFilter.MIPNONE);
				(<IContextStageGL> stage.context).activateTexture(methodVO.texturesIndex, this._texture);

				if (shaderObject.alphaThreshold > 0)
					shaderObject.fragmentConstantData[methodVO.fragmentConstantsIndex] = shaderObject.alphaThreshold;
			} else {
				var index:number = methodVO.fragmentConstantsIndex;
				var data:Array<number> = shaderObject.fragmentConstantData;
				data[index] = this._colorR;
				data[index + 1] = this._colorG;
				data[index + 2] = this._colorB;
				data[index + 3] = this._alpha;
			}
		}

		/**
		 * Updates the ambient color data used by the render state.
		 */
		private updateColor()
		{
			this._colorR = ((this._color >> 16) & 0xff)/0xff*this._ambient;
			this._colorG = ((this._color >> 8) & 0xff)/0xff*this._ambient;
			this._colorB = (this._color & 0xff)/0xff*this._ambient;
		}
	}
}
