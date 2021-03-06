///<reference path="../../_definitions.ts"/>

module away.stagegl
{

	export class ContextWebGL extends ContextGLBase implements IContextStageGL
	{
		private _blendFactorDictionary:Object = new Object();
		private _depthTestDictionary:Object = new Object();
		private _textureIndexDictionary:Array<number> = new Array<number>(8);
		private _textureTypeDictionary:Object = new Object();
		private _wrapDictionary:Object = new Object();
		private _filterDictionary:Object = new Object();
		private _mipmapFilterDictionary:Object = new Object();
		private _uniformLocationNameDictionary:Object = new Object();
		private _vertexBufferDimensionDictionary:Object = new Object();

		private _drawing:boolean;
		private _blendEnabled:boolean;
		private _blendSourceFactor:number;
		private _blendDestinationFactor:number;

		private _indexBufferList:Array<IndexBufferWebGL> = new Array<IndexBufferWebGL>();
		private _vertexBufferList:Array<VertexBufferWebGL> = new Array<VertexBufferWebGL>();
		private _textureList:Array<TextureBaseWebGL> = new Array<TextureBaseWebGL>();
		private _programList:Array<ProgramWebGL> = new Array<ProgramWebGL>();

		private _samplerStates:Array<SamplerState> = new Array<SamplerState>(8);

		public static MAX_SAMPLERS:number = 8;

		//@protected
		public _gl:WebGLRenderingContext;

		//@protected
		public _currentProgram:ProgramWebGL;
		private _activeTexture:number;


		public get container():HTMLElement
		{
			return this._pContainer;
		}

		constructor(canvas:HTMLCanvasElement, stageIndex:number)
		{
			super(stageIndex);

			this._pContainer = canvas;

			try {
				this._gl = <WebGLRenderingContext> canvas.getContext("experimental-webgl", { premultipliedAlpha:false, alpha:false });

				if (!this._gl)
					this._gl = <WebGLRenderingContext> canvas.getContext("webgl", { premultipliedAlpha:false, alpha:false });
			} catch (e) {
				//this.dispatchEvent( new away.events.AwayEvent( away.events.AwayEvent.INITIALIZE_FAILED, e ) );
			}

			if (this._gl) {
				//this.dispatchEvent( new away.events.AwayEvent( away.events.AwayEvent.INITIALIZE_SUCCESS ) );
				//setup shortcut dictionaries
				this._blendFactorDictionary[ContextGLBlendFactor.ONE] = this._gl.ONE;
				this._blendFactorDictionary[ContextGLBlendFactor.DESTINATION_ALPHA] = this._gl.DST_ALPHA;
				this._blendFactorDictionary[ContextGLBlendFactor.DESTINATION_COLOR] = this._gl.DST_COLOR;
				this._blendFactorDictionary[ContextGLBlendFactor.ONE] = this._gl.ONE;
				this._blendFactorDictionary[ContextGLBlendFactor.ONE_MINUS_DESTINATION_ALPHA] = this._gl.ONE_MINUS_DST_ALPHA;
				this._blendFactorDictionary[ContextGLBlendFactor.ONE_MINUS_DESTINATION_COLOR] = this._gl.ONE_MINUS_DST_COLOR;
				this._blendFactorDictionary[ContextGLBlendFactor.ONE_MINUS_SOURCE_ALPHA] = this._gl.ONE_MINUS_SRC_ALPHA;
				this._blendFactorDictionary[ContextGLBlendFactor.ONE_MINUS_SOURCE_COLOR] = this._gl.ONE_MINUS_SRC_COLOR;
				this._blendFactorDictionary[ContextGLBlendFactor.SOURCE_ALPHA] = this._gl.SRC_ALPHA;
				this._blendFactorDictionary[ContextGLBlendFactor.SOURCE_COLOR] = this._gl.SRC_COLOR;
				this._blendFactorDictionary[ContextGLBlendFactor.ZERO] = this._gl.ZERO;

				this._depthTestDictionary[ContextGLCompareMode.ALWAYS] = this._gl.ALWAYS;
				this._depthTestDictionary[ContextGLCompareMode.EQUAL] = this._gl.EQUAL;
				this._depthTestDictionary[ContextGLCompareMode.GREATER] = this._gl.GREATER;
				this._depthTestDictionary[ContextGLCompareMode.GREATER_EQUAL] = this._gl.GEQUAL;
				this._depthTestDictionary[ContextGLCompareMode.LESS] = this._gl.LESS;
				this._depthTestDictionary[ContextGLCompareMode.LESS_EQUAL] = this._gl.LEQUAL;
				this._depthTestDictionary[ContextGLCompareMode.NEVER] = this._gl.NEVER;
				this._depthTestDictionary[ContextGLCompareMode.NOT_EQUAL] = this._gl.NOTEQUAL;

				this._textureIndexDictionary[0] = this._gl.TEXTURE0;
				this._textureIndexDictionary[1] = this._gl.TEXTURE1;
				this._textureIndexDictionary[2] = this._gl.TEXTURE2;
				this._textureIndexDictionary[3] = this._gl.TEXTURE3;
				this._textureIndexDictionary[4] = this._gl.TEXTURE4;
				this._textureIndexDictionary[5] = this._gl.TEXTURE5;
				this._textureIndexDictionary[6] = this._gl.TEXTURE6;
				this._textureIndexDictionary[7] = this._gl.TEXTURE7;

				this._textureTypeDictionary["texture2d"] = this._gl.TEXTURE_2D;
				this._textureTypeDictionary["textureCube"] = this._gl.TEXTURE_CUBE_MAP;

				this._wrapDictionary[ContextGLWrapMode.REPEAT] = this._gl.REPEAT;
				this._wrapDictionary[ContextGLWrapMode.CLAMP] = this._gl.CLAMP_TO_EDGE;

				this._filterDictionary[ContextGLTextureFilter.LINEAR] = this._gl.LINEAR;
				this._filterDictionary[ContextGLTextureFilter.NEAREST] = this._gl.NEAREST;

				this._mipmapFilterDictionary[ContextGLTextureFilter.LINEAR] = new Object();
				this._mipmapFilterDictionary[ContextGLTextureFilter.LINEAR][ContextGLMipFilter.MIPNEAREST] = this._gl.LINEAR_MIPMAP_NEAREST;
				this._mipmapFilterDictionary[ContextGLTextureFilter.LINEAR][ContextGLMipFilter.MIPLINEAR] = this._gl.LINEAR_MIPMAP_LINEAR;
				this._mipmapFilterDictionary[ContextGLTextureFilter.LINEAR][ContextGLMipFilter.MIPNONE] = this._gl.LINEAR;
				this._mipmapFilterDictionary[ContextGLTextureFilter.NEAREST] = new Object();
				this._mipmapFilterDictionary[ContextGLTextureFilter.NEAREST][ContextGLMipFilter.MIPNEAREST] = this._gl.NEAREST_MIPMAP_NEAREST;
				this._mipmapFilterDictionary[ContextGLTextureFilter.NEAREST][ContextGLMipFilter.MIPLINEAR] = this._gl.NEAREST_MIPMAP_LINEAR;
				this._mipmapFilterDictionary[ContextGLTextureFilter.NEAREST][ContextGLMipFilter.MIPNONE] = this._gl.NEAREST;

				this._uniformLocationNameDictionary[ContextGLProgramType.VERTEX] = "vc";
				this._uniformLocationNameDictionary[ContextGLProgramType.FRAGMENT] = "fc";

				this._vertexBufferDimensionDictionary[ContextGLVertexBufferFormat.FLOAT_1] = 1;
				this._vertexBufferDimensionDictionary[ContextGLVertexBufferFormat.FLOAT_2] = 2;
				this._vertexBufferDimensionDictionary[ContextGLVertexBufferFormat.FLOAT_3] = 3;
				this._vertexBufferDimensionDictionary[ContextGLVertexBufferFormat.FLOAT_4] = 4;
				this._vertexBufferDimensionDictionary[ContextGLVertexBufferFormat.BYTES_4] = 4;
			} else {
				//this.dispatchEvent( new away.events.AwayEvent( away.events.AwayEvent.INITIALIZE_FAILED, e ) );
				alert("WebGL is not available.");
			}

			//defaults
			for (var i:number = 0; i < ContextWebGL.MAX_SAMPLERS; ++i) {
				this._samplerStates[i] = new SamplerState();
				this._samplerStates[i].wrap = this._gl.REPEAT;
				this._samplerStates[i].filter = this._gl.LINEAR;
				this._samplerStates[i].mipfilter = this._gl.LINEAR;
			}
		}

		public gl():WebGLRenderingContext
		{
			return this._gl;
		}

		public clear(red:number = 0, green:number = 0, blue:number = 0, alpha:number = 1, depth:number = 1, stencil:number = 0, mask:number = ContextGLClearMask.ALL)
		{
			if (!this._drawing) {
				this.updateBlendStatus();
				this._drawing = true;
			}

			var glmask:number = 0;
			if (mask & ContextGLClearMask.COLOR) glmask |= this._gl.COLOR_BUFFER_BIT;
			if (mask & ContextGLClearMask.STENCIL) glmask |= this._gl.STENCIL_BUFFER_BIT;
			if (mask & ContextGLClearMask.DEPTH) glmask |= this._gl.DEPTH_BUFFER_BIT;

			this._gl.clearColor(red, green, blue, alpha);
			this._gl.clearDepth(depth);
			this._gl.clearStencil(stencil);
			this._gl.clear(glmask);
		}

		public configureBackBuffer(width:number, height:number, antiAlias:number, enableDepthAndStencil:boolean = true)
		{
			super.configureBackBuffer(width, height, antiAlias, enableDepthAndStencil);

			if (enableDepthAndStencil) {
				this._gl.enable(this._gl.STENCIL_TEST);
				this._gl.enable(this._gl.DEPTH_TEST);
			}

			this._gl.viewport['width'] = width;
			this._gl.viewport['height'] = height;

			this._gl.viewport(0, 0, width, height);
		}

		public createCubeTexture(size:number, format:string, optimizeForRenderToTexture:boolean, streamingLevels:number = 0):CubeTextureWebGL
		{
			var texture:CubeTextureWebGL = new CubeTextureWebGL(this._gl, size);
			this._textureList.push(texture);
			return texture;
		}

		public createIndexBuffer(numIndices:number):IndexBufferWebGL
		{
			var indexBuffer:IndexBufferWebGL = new IndexBufferWebGL(this._gl, numIndices);
			this._indexBufferList.push(indexBuffer);
			return indexBuffer;
		}

		public createProgram():ProgramWebGL
		{
			var program:ProgramWebGL = new ProgramWebGL(this._gl);
			this._programList.push(program);
			return program;
		}

		public createTexture(width:number, height:number, format:string, optimizeForRenderToTexture:boolean, streamingLevels:number = 0):TextureWebGL
		{
			//TODO streaming
			var texture:TextureWebGL = new TextureWebGL(this._gl, width, height);
			this._textureList.push(texture);
			return texture;
		}

		public createVertexBuffer(numVertices:number, data32PerVertex:number):VertexBufferWebGL
		{
			var vertexBuffer:VertexBufferWebGL = new VertexBufferWebGL(this._gl, numVertices, data32PerVertex);
			this._vertexBufferList.push(vertexBuffer);
			return vertexBuffer;
		}

		public dispose()
		{
			var i:number;
			for (i = 0; i < this._indexBufferList.length; ++i)
				this._indexBufferList[i].dispose();

			this._indexBufferList = null;

			for (i = 0; i < this._vertexBufferList.length; ++i)
				this._vertexBufferList[i].dispose();

			this._vertexBufferList = null;

			for (i = 0; i < this._textureList.length; ++i)
				this._textureList[i].dispose();

			this._textureList = null;

			for (i = 0; i < this._programList.length; ++i)
				this._programList[i].dispose();

			for (i = 0; i < this._samplerStates.length; ++i)
				this._samplerStates[i] = null;

			this._programList = null;
		}

		public drawToBitmapData(destination:away.base.BitmapData)
		{
			var arrayBuffer:ArrayBuffer = new ArrayBuffer(destination.width*destination.height*4);

			this._gl.readPixels(0, 0, destination.width, destination.height, this._gl.RGBA, this._gl.UNSIGNED_BYTE, new Uint8Array(arrayBuffer));

			var byteArray:away.utils.ByteArray = new away.utils.ByteArray();
			byteArray.setArrayBuffer(arrayBuffer);

			destination.setPixels(new away.geom.Rectangle(0, 0, destination.width, destination.height), byteArray);
		}

		public drawTriangles(indexBuffer:IndexBufferWebGL, firstIndex:number = 0, numTriangles:number = -1)
		{
			if (!this._drawing)
				throw "Need to clear before drawing if the buffer has not been cleared since the last present() call.";

			this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, indexBuffer.glBuffer);
			this._gl.drawElements(this._gl.TRIANGLES, (numTriangles == -1)? indexBuffer.numIndices : numTriangles*3, this._gl.UNSIGNED_SHORT, firstIndex);
		}

		public present()
		{
			this._drawing = false;
		}

		public setBlendFactors(sourceFactor:string, destinationFactor:string)
		{
			this._blendEnabled = true;

			this._blendSourceFactor = this._blendFactorDictionary[sourceFactor];

			this._blendDestinationFactor = this._blendFactorDictionary[destinationFactor];

			this.updateBlendStatus();
		}

		public setColorMask(red:boolean, green:boolean, blue:boolean, alpha:boolean)
		{
			this._gl.colorMask(red, green, blue, alpha);
		}

		public setCulling(triangleFaceToCull:string, coordinateSystem:string = "leftHanded")
		{
			if (triangleFaceToCull == ContextGLTriangleFace.NONE) {
				this._gl.disable(this._gl.CULL_FACE);
			} else {
				this._gl.enable(this._gl.CULL_FACE);
				switch (triangleFaceToCull) {
					case ContextGLTriangleFace.BACK:
						this._gl.cullFace((coordinateSystem == "leftHanded")? this._gl.FRONT : this._gl.BACK);
						break
					case ContextGLTriangleFace.FRONT:
						this._gl.cullFace((coordinateSystem == "leftHanded")? this._gl.BACK : this._gl.FRONT);
						break;
					case ContextGLTriangleFace.FRONT_AND_BACK:
						this._gl.cullFace(this._gl.FRONT_AND_BACK);
						break;
					default:
						throw "Unknown ContextGLTriangleFace type."; // TODO error
				}
			}
		}

		// TODO ContextGLCompareMode
		public setDepthTest(depthMask:boolean, passCompareMode:string)
		{
			this._gl.depthFunc(this._depthTestDictionary[passCompareMode]);

			this._gl.depthMask(depthMask);
		}

		public setProgram(program:ProgramWebGL)
		{
			//TODO decide on construction/reference resposibilities
			this._currentProgram = program;
			program.focusProgram();
		}

		public setProgramConstantsFromMatrix(programType:string, firstRegister:number, matrix:away.geom.Matrix3D, transposedMatrix:boolean = false)
		{
			//this._gl.uniformMatrix4fv(this._gl.getUniformLocation(this._currentProgram.glProgram, this._uniformLocationNameDictionary[programType]), !transposedMatrix, new Float32Array(matrix.rawData));

			//TODO remove special case for WebGL matrix calls?
			var d:number[] = matrix.rawData;
			if (transposedMatrix) {
				this.setProgramConstantsFromArray(programType, firstRegister, [ d[0], d[4], d[8], d[12] ], 1);
				this.setProgramConstantsFromArray(programType, firstRegister + 1, [ d[1], d[5], d[9], d[13] ], 1);
				this.setProgramConstantsFromArray(programType, firstRegister + 2, [ d[2], d[6], d[10], d[14] ], 1);
				this.setProgramConstantsFromArray(programType, firstRegister + 3, [ d[3], d[7], d[11], d[15] ], 1);
			} else {
				this.setProgramConstantsFromArray(programType, firstRegister, [ d[0], d[1], d[2], d[3] ], 1);
				this.setProgramConstantsFromArray(programType, firstRegister + 1, [ d[4], d[5], d[6], d[7] ], 1);
				this.setProgramConstantsFromArray(programType, firstRegister + 2, [ d[8], d[9], d[10], d[11] ], 1);
				this.setProgramConstantsFromArray(programType, firstRegister + 3, [ d[12], d[13], d[14], d[15] ], 1);
			}
		}

		public static modulo:number = 0;

		public setProgramConstantsFromArray(programType:string, firstRegister:number, data:number[], numRegisters:number = -1)
		{
			var locationName:string = this._uniformLocationNameDictionary[programType];
			var startIndex:number;
			for (var i:number = 0; i < numRegisters; i++) {
				startIndex = i*4;
				this._gl.uniform4f(this._gl.getUniformLocation(this._currentProgram.glProgram, locationName + (firstRegister + i)), data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]);
			}
		}

		public setScissorRectangle(rectangle:away.geom.Rectangle)
		{
			if (!rectangle) {
				this._gl.disable(this._gl.SCISSOR_TEST);
				return;
			}

			this._gl.enable(this._gl.SCISSOR_TEST);
			this._gl.scissor(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
		}

		public setTextureAt(sampler:number, texture:TextureBaseWebGL)
		{
			var samplerState:SamplerState = this._samplerStates[sampler];

			if (this._activeTexture != sampler && (texture || samplerState.type)) {
				this._activeTexture = sampler;
				this._gl.activeTexture(this._textureIndexDictionary[sampler]);
			}

			if (!texture) {
				if (samplerState.type) {
					this._gl.bindTexture(samplerState.type, null);
					samplerState.type = null;
				}

				return;
			}

			var textureType:number = this._textureTypeDictionary[texture.textureType];
			samplerState.type = textureType;

			this._gl.bindTexture(textureType, texture.glTexture);

			this._gl.uniform1i(this._gl.getUniformLocation(this._currentProgram.glProgram, "fs" + sampler), sampler);

			this._gl.texParameteri(textureType, this._gl.TEXTURE_WRAP_S, samplerState.wrap);
			this._gl.texParameteri(textureType, this._gl.TEXTURE_WRAP_T, samplerState.wrap);

			this._gl.texParameteri(textureType, this._gl.TEXTURE_MAG_FILTER, samplerState.filter);
			this._gl.texParameteri(textureType, this._gl.TEXTURE_MIN_FILTER, samplerState.mipfilter);
		}

		public setSamplerStateAt(sampler:number, wrap:string, filter:string, mipfilter:string):void
		{
			if (0 <= sampler && sampler < ContextWebGL.MAX_SAMPLERS) {
				this._samplerStates[sampler].wrap = this._wrapDictionary[wrap];
				this._samplerStates[sampler].filter = this._filterDictionary[filter];
				this._samplerStates[sampler].mipfilter = this._mipmapFilterDictionary[filter][mipfilter];
			} else {
				throw "Sampler is out of bounds.";
			}
		}

		public setVertexBufferAt(index:number, buffer:VertexBufferWebGL, bufferOffset:number = 0, format:string = null)
		{
			var location:number = this._currentProgram? this._gl.getAttribLocation(this._currentProgram.glProgram, "va" + index) : -1;

			if (!buffer) {
				if (location > -1)
					this._gl.disableVertexAttribArray(location);

				return;
			}

			this._gl.bindBuffer(this._gl.ARRAY_BUFFER, buffer.glBuffer);
			this._gl.enableVertexAttribArray(location);
			this._gl.vertexAttribPointer(location, this._vertexBufferDimensionDictionary[format], this._gl.FLOAT, false, buffer.data32PerVertex*4, bufferOffset*4);
		}

		public setRenderToTexture(target:TextureBaseWebGL, enableDepthAndStencil:boolean = false, antiAlias:number = 0, surfaceSelector:number = 0)
		{
			var texture:TextureWebGL = <TextureWebGL> target;
			var frameBuffer:WebGLFramebuffer = texture.frameBuffer;
			this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, frameBuffer);

			if (enableDepthAndStencil) {
				this._gl.enable(this._gl.STENCIL_TEST);
				this._gl.enable(this._gl.DEPTH_TEST);
			}

			this._gl.viewport(0, 0, texture.width, texture.height );
		}

		public setRenderToBackBuffer()
		{
			this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
		}

		private updateBlendStatus()
		{
			if (this._blendEnabled) {
				this._gl.enable(this._gl.BLEND);
				this._gl.blendEquation(this._gl.FUNC_ADD);
				this._gl.blendFunc(this._blendSourceFactor, this._blendDestinationFactor);
			} else {
				this._gl.disable(this._gl.BLEND);
			}
		}
	}
}