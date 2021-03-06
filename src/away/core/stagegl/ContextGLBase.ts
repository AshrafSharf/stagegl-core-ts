///<reference path="../../_definitions.ts"/>

module away.stagegl
{
	import AnimatorBase						= away.animators.AnimatorBase;
	import AnimationSetBase					= away.animators.AnimationSetBase;
	import IMaterialOwner					= away.base.IMaterialOwner;
	import Stage							= away.base.Stage;
	import Camera							= away.entities.Camera;
	import AbstractMethodError				= away.errors.AbstractMethodError;
	import Matrix3D							= away.geom.Matrix3D;
	import Rectangle						= away.geom.Rectangle;
	import IndexData						= away.pool.IndexData;
	import ShaderObjectData					= away.pool.ShaderObjectData;
	import ShaderObjectDataPool				= away.pool.ShaderObjectDataPool;
	import TextureData						= away.pool.TextureData;
	import TextureDataPool					= away.pool.TextureDataPool;
	import ProgramData						= away.pool.ProgramData;
	import ProgramDataPool					= away.pool.ProgramDataPool;
	import RenderableBase					= away.pool.RenderableBase;
	import RenderOrderData					= away.pool.RenderOrderData;
	import RenderOrderDataPool				= away.pool.RenderOrderDataPool;
	import VertexData						= away.pool.VertexData;
	import MaterialBase						= away.materials.MaterialBase;
	import MaterialPassBase					= away.materials.MaterialPassBase;
	import MaterialPassVO					= away.materials.MaterialPassVO;
	import ShaderCompilerBase				= away.materials.ShaderCompilerBase;
	import ShaderObjectBase					= away.materials.ShaderObjectBase;
	import CubeTextureBase					= away.textures.CubeTextureBase;
	import RenderTexture					= away.textures.RenderTexture;
	import Texture2DBase					= away.textures.Texture2DBase;
	import TextureProxyBase					= away.textures.TextureProxyBase;
	import ByteArray						= away.utils.ByteArray;

	/**
	 * Stage provides a proxy class to handle the creation and attachment of the Context
	 * (and in turn the back buffer) it uses. Stage should never be created directly,
	 * but requested through StageManager.
	 *
	 * @see away.managers.StageManager
	 *
	 */
	export class ContextGLBase implements away.display.IContext
	{
		private _programData:Array<ProgramData> = new Array<ProgramData>();
		private _numUsedStreams:number = 0;
		private _numUsedTextures:number = 0;

		public _pContainer:HTMLElement;

		private _texturePool:TextureDataPool;

		private _renderOrderPool:RenderOrderDataPool

		private _shaderObjectDataPool:ShaderObjectDataPool;

		private _programDataPool:ProgramDataPool;

		private _width:number;
		private _height:number;

		//private static _frameEventDriver:Shape = new Shape(); // TODO: add frame driver / request animation frame

		private _stageIndex:number = -1;
		private _antiAlias:number = 0;
		private _enableDepthAndStencil:boolean;
		private _renderTarget:TextureProxyBase = null;
		private _renderSurfaceSelector:number = 0;

		public get container():HTMLElement
		{
			return this._pContainer;
		}

		constructor(stageIndex:number)
		{
			this._stageIndex = stageIndex;
			this._texturePool = new TextureDataPool(this);
			this._renderOrderPool = new RenderOrderDataPool(this);
			this._shaderObjectDataPool = new ShaderObjectDataPool(this);
			this._programDataPool = new ProgramDataPool(this);
		}

		public setRenderTarget(target:TextureProxyBase, enableDepthAndStencil:boolean = false, surfaceSelector:number = 0)
		{
			if (this._renderTarget === target && surfaceSelector == this._renderSurfaceSelector && this._enableDepthAndStencil == enableDepthAndStencil)
				return;

			this._renderTarget = target;
			this._renderSurfaceSelector = surfaceSelector;
			this._enableDepthAndStencil = enableDepthAndStencil;
			if (target instanceof RenderTexture) {
				this.setRenderToTexture(this.getRenderTexture(<RenderTexture> target), enableDepthAndStencil, this._antiAlias, surfaceSelector);
			} else {
				this.setRenderToBackBuffer();
				this.configureBackBuffer(this._width, this._height, this._antiAlias, this._enableDepthAndStencil);
			}
		}

		public getRenderTexture(textureProxy:RenderTexture):ITextureBase
		{
			var textureData:TextureData = this._texturePool.getItem(textureProxy);

			if (!textureData.texture)
				textureData.texture = this.createTexture(textureProxy.width, textureProxy.height, ContextGLTextureFormat.BGRA, true);

			return textureData.texture;
		}

		public getShaderObject(materialPassVO:MaterialPassVO, profile:string):ShaderObjectData
		{
			var shaderObjectData:ShaderObjectData = this._shaderObjectDataPool.getItem(materialPassVO);

			if (!shaderObjectData.shaderObject) {
				shaderObjectData.shaderObject = materialPassVO.materialPass.createShaderObject(profile);
				shaderObjectData.invalid = true;
			}

			if (shaderObjectData.invalid) {
				shaderObjectData.invalid = false;
				var compiler:ShaderCompilerBase = shaderObjectData.shaderObject.createCompiler(materialPassVO);
				compiler.compile();

				shaderObjectData.shadedTarget = compiler.shadedTarget;
				shaderObjectData.vertexCode = compiler.vertexCode;
				shaderObjectData.fragmentCode = compiler.fragmentCode;
				shaderObjectData.postAnimationFragmentCode = compiler.postAnimationFragmentCode;
				shaderObjectData.key = "";
			}

			return shaderObjectData;
		}

		public getProgram(shaderObjectData:ShaderObjectData):ProgramData
		{
			//check key doesn't need re-concatenating
			if (!shaderObjectData.key.length) {
				shaderObjectData.key = shaderObjectData.animationVertexCode +
					shaderObjectData.vertexCode +
					"---" +
					shaderObjectData.fragmentCode +
					shaderObjectData.animationFragmentCode +
					shaderObjectData.postAnimationFragmentCode;
			} else {
				return shaderObjectData.programData;
			}

			var programData:ProgramData = this._programDataPool.getItem(shaderObjectData.key);

			//check program data hasn't changed, keep count of program usages
			if (shaderObjectData.programData != programData) {
				if (shaderObjectData.programData)
					shaderObjectData.programData.dispose();

				shaderObjectData.programData = programData;

				programData.usages++;
			}

			return programData;
		}

		/**
		 *
		 * @param material
		 */
		public getRenderOrderId(material:MaterialBase, profile:string):number
		{
			var renderOrderData:RenderOrderData = this._renderOrderPool.getItem(material);
			var shaderObjects:Array<ShaderObjectData> = renderOrderData.shaderObjects;

			if (!shaderObjects) {
				//reset the shader objects in RenderOrderData
				shaderObjects = renderOrderData.shaderObjects = new Array<ShaderObjectData>(numPasses);

				var passes:Array<MaterialPassBase> = <Array<MaterialPassBase>> material.iPasses;
				var numPasses:number = passes.length;

				//get the shader object for each pass and store
				for (var i:number = 0; i < numPasses; i++)
					shaderObjects[i] = this.getShaderObject(passes[i].getMaterialPassVO(material.id), profile);

				renderOrderData.invalid = true;
			}

			if (renderOrderData.invalid) {
				renderOrderData.invalid = false;

				var enabledGPUAnimation:boolean = this.getEnabledGPUAnimation(material, shaderObjects);

				var renderOrderId = 0;
				var mult:number = 1;
				var shaderObject:ShaderObjectData;
				var len:number = shaderObjects.length;
				for (var i:number = 0; i < len; i++) {
					shaderObject = shaderObjects[i];
					shaderObject.shaderObject.usesAnimation = enabledGPUAnimation;
					this.calcAnimationCode(material, shaderObject)
					renderOrderId += this.getProgram(shaderObject).id*mult;
					mult *= 1000;
				}

				return (renderOrderData.id = renderOrderId);
			}

			return renderOrderData.id;
		}

		/**
		 * Assigns an attribute stream
		 *
		 * @param index The attribute stream index for the vertex shader
		 * @param buffer
		 * @param offset
		 * @param stride
		 * @param format
		 */
		public activateBuffer(index:number, buffer:VertexData, offset:number, format:string)
		{
			if (!buffer.contexts[this._stageIndex])
				buffer.contexts[this._stageIndex] = this;

			if (!buffer.buffers[this._stageIndex]) {
				buffer.buffers[this._stageIndex] = this.createVertexBuffer(buffer.data.length/buffer.dataPerVertex, buffer.dataPerVertex);
				buffer.invalid[this._stageIndex] = true;
			}

			if (buffer.invalid[this._stageIndex]) {
				buffer.buffers[this._stageIndex].uploadFromArray(buffer.data, 0, buffer.data.length/buffer.dataPerVertex);
				buffer.invalid[this._stageIndex] = false;
			}

			this.setVertexBufferAt(index, buffer.buffers[this._stageIndex], offset, format);
		}

		public disposeVertexData(buffer:VertexData)
		{
			buffer.buffers[this._stageIndex].dispose();
			buffer.buffers[this._stageIndex] = null;
		}

		public activateRenderTexture(index:number, textureProxy:RenderTexture)
		{
			this.setTextureAt(index, this.getRenderTexture(textureProxy));
		}

		public activateShaderObject(shaderObjectData:ShaderObjectData, stage:Stage, camera:Camera)
		{
			//clear unused vertex streams
			for (var i = shaderObjectData.shaderObject.numUsedStreams; i < this._numUsedStreams; i++)
				this.setVertexBufferAt(i, null);

			//clear unused texture streams
			for (var i = shaderObjectData.shaderObject.numUsedTextures; i < this._numUsedTextures; i++)
				this.setTextureAt(i, null);

			//activate shader object
			shaderObjectData.shaderObject.iActivate(stage, camera);

			//check program data is uploaded
			var programData:ProgramData = this.getProgram(shaderObjectData);
			if (!programData.program) {
				programData.program = this.createProgram();
				var vertexByteCode:ByteArray = (new aglsl.assembler.AGALMiniAssembler().assemble("part vertex 1\n" + shaderObjectData.animationVertexCode + shaderObjectData.vertexCode + "endpart"))['vertex'].data;
				var fragmentByteCode:ByteArray = (new aglsl.assembler.AGALMiniAssembler().assemble("part fragment 1\n" + shaderObjectData.fragmentCode + shaderObjectData.animationFragmentCode + shaderObjectData.postAnimationFragmentCode + "endpart"))['fragment'].data;
				programData.program.upload(vertexByteCode, fragmentByteCode);
			}

			//set program data
			this.setProgram(programData.program);
		}

		public deactivateShaderObject(shaderObjectData:ShaderObjectData, stage:Stage)
		{
			shaderObjectData.shaderObject.iDeactivate(stage);

			this._numUsedStreams = shaderObjectData.shaderObject.numUsedStreams;
			this._numUsedTextures = shaderObjectData.shaderObject.numUsedTextures;
		}

		public activateTexture(index:number, textureProxy:Texture2DBase)
		{
			var textureData:TextureData = <TextureData> this._texturePool.getItem(textureProxy);

			if (!textureData.texture) {
				textureData.texture = this.createTexture(textureProxy.width, textureProxy.height, ContextGLTextureFormat.BGRA, true);
				textureData.invalid = true;
			}

			if (textureData.invalid) {
				textureData.invalid = false;
				if (textureProxy.generateMipmaps) {
					var mipmapData:Array<away.base.BitmapData> = textureProxy._iGetMipmapData();
					var len:number = mipmapData.length;
					for (var i:number = 0; i < len; i++)
						(<ITexture> textureData.texture).uploadFromData(mipmapData[i], i);
				} else {
					(<ITexture> textureData.texture).uploadFromData(textureProxy._iGetTextureData(), 0);
				}
			}

			this.setTextureAt(index, textureData.texture);
		}

		public activateCubeTexture(index:number, textureProxy:CubeTextureBase)
		{
			var textureData:TextureData = <TextureData> this._texturePool.getItem(textureProxy);

			if (!textureData.texture) {
				textureData.texture = this.createCubeTexture(textureProxy.size, ContextGLTextureFormat.BGRA, false);
				textureData.invalid = true;
			}

			if (textureData.invalid) {
				textureData.invalid = false;
				for (var i:number = 0; i < 6; ++i) {
					if (textureProxy.generateMipmaps) {
						var mipmapData:Array<away.base.BitmapData> = textureProxy._iGetMipmapData(i);
						var len:number = mipmapData.length;
						for (var j:number = 0; j < len; j++)
							(<ICubeTexture> textureData.texture).uploadFromData(mipmapData[j], i, j);
					} else {
						(<ICubeTexture> textureData.texture).uploadFromData(textureProxy._iGetTextureData(i), i, 0);
					}
				}
			}

			this.setTextureAt(index, textureData.texture);
		}

		/**
		 * Retrieves the VertexBuffer object that contains triangle indices.
		 * @param context The ContextWeb for which we request the buffer
		 * @return The VertexBuffer object that contains triangle indices.
		 */
		public getIndexBuffer(buffer:IndexData):IIndexBuffer
		{
			if (!buffer.contexts[this._stageIndex])
				buffer.contexts[this._stageIndex] = this;

			if (!buffer.buffers[this._stageIndex]) {
				buffer.buffers[this._stageIndex] = this.createIndexBuffer(buffer.data.length);
				buffer.invalid[this._stageIndex] = true;
			}

			if (buffer.invalid[this._stageIndex]) {
				buffer.buffers[this._stageIndex].uploadFromArray(buffer.data, 0, buffer.data.length);
				buffer.invalid[this._stageIndex] = false;
			}

			return buffer.buffers[this._stageIndex];
		}

		public disposeIndexData(buffer:IndexData)
		{
			buffer.buffers[this._stageIndex].dispose();
			buffer.buffers[this._stageIndex] = null;
		}

		public clear(red:number = 0, green:number = 0, blue:number = 0, alpha:number = 1, depth:number = 1, stencil:number = 0, mask:number = ContextGLClearMask.ALL)
		{

		}

		public configureBackBuffer(width:number, height:number, antiAlias:number, enableDepthAndStencil:boolean = true)
		{
			this._width = width;
			this._height = height;
		}

		public createIndexBuffer(numIndices:number):IIndexBuffer
		{
			throw new AbstractMethodError();
		}

		public createVertexBuffer(numVertices:number, data32PerVertex:number):IVertexBuffer
		{
			throw new AbstractMethodError();
		}

		public createTexture(width:number, height:number, format:string, optimizeForRenderToTexture:boolean, streamingLevels:number = 0):ITexture
		{
			throw new AbstractMethodError();
		}

		public createCubeTexture(size:number, format:string, optimizeForRenderToTexture:boolean, streamingLevels:number = 0):ICubeTexture
		{
			throw new AbstractMethodError();
		}

		public createProgram():IProgram
		{
			throw new AbstractMethodError();
		}

		public dispose()
		{

		}

		public present()
		{

		}

		public setRenderToTexture(target:ITextureBase, enableDepthAndStencil:boolean = false, antiAlias:number = 0, surfaceSelector:number = 0)
		{

		}

		public setRenderToBackBuffer()
		{

		}

		public setScissorRectangle(rectangle:away.geom.Rectangle)
		{

		}

		public setTextureAt(sampler:number, texture:ITextureBase)
		{

		}

		public setVertexBufferAt(index:number, buffer:IVertexBuffer, bufferOffset:number = 0, format:string = null)
		{

		}

		public setProgram(program:IProgram)
		{

		}

		public registerProgram(programData:ProgramData)
		{
			var i:number = 0;
			while (this._programData[i] != null)
				i++;

			this._programData[i] = programData;
			programData.id = i;
		}

		public unRegisterProgram(programData:ProgramData)
		{
			this._programData[programData.id] = null;
			programData.id = -1;
		}


		/**
		 * test if animation will be able to run on gpu BEFORE compiling materials
		 * test if the shader objects supports animating the animation set in the vertex shader
		 * if any object using this material fails to support accelerated animations for any of the shader objects,
		 * we should do everything on cpu (otherwise we have the cost of both gpu + cpu animations)
		 */
		private getEnabledGPUAnimation(material:MaterialBase, shaderObjects:Array<ShaderObjectData>):boolean
		{
			if (material.animationSet) {
				material.animationSet.resetGPUCompatibility();

				var owners:Array<IMaterialOwner> = material.iOwners;
				var numOwners:number = owners.length;

				var len:number = shaderObjects.length;
				for (var i:number = 0; i < len; i++)
					for (var j:number = 0; j < numOwners; j++)
						if (owners[j].animator)
							(<AnimatorBase> owners[j].animator).testGPUCompatibility(shaderObjects[i].shaderObject);

				return !material.animationSet.usesCPU;
			}

			return false;
		}

		private calcAnimationCode(material:MaterialBase, shaderObjectData:ShaderObjectData)
		{
			//reset key so that the program is re-calculated
			shaderObjectData.key = "";
			shaderObjectData.animationVertexCode = "";
			shaderObjectData.animationFragmentCode = "";

			var shaderObject:ShaderObjectBase = shaderObjectData.shaderObject;

			//check to see if GPU animation is used
			if (shaderObject.usesAnimation) {

				var animationSet:AnimationSetBase = <AnimationSetBase> material.animationSet;

				shaderObjectData.animationVertexCode += animationSet.getAGALVertexCode(shaderObject);

				if (shaderObject.uvDependencies > 0 && !shaderObject.usesUVTransform)
					shaderObjectData.animationVertexCode += animationSet.getAGALUVCode(shaderObject);

				if (shaderObject.usesFragmentAnimation)
					shaderObjectData.animationFragmentCode += animationSet.getAGALFragmentCode(shaderObject, shaderObjectData.shadedTarget);

				animationSet.doneAGALCode(shaderObject);

			} else {
				// simply write attributes to targets, do not animate them
				// projection will pick up on targets[0] to do the projection
				var len:number = shaderObject.animatableAttributes.length;
				for (var i:number = 0; i < len; ++i)
					shaderObjectData.animationVertexCode += "mov " + shaderObject.animationTargetRegisters[i] + ", " + shaderObject.animatableAttributes[i] + "\n";

				if (shaderObject.uvDependencies > 0 && !shaderObject.usesUVTransform)
					shaderObjectData.animationVertexCode += "mov " + shaderObject.uvTarget + "," + shaderObject.uvSource + "\n";
			}
		}
	}
}