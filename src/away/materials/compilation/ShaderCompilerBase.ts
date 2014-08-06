///<reference path="../../_definitions.ts"/>

module away.materials
{
	import AnimationSetBase				= away.animators.AnimationSetBase;

	/**
	 * ShaderCompilerBase is an abstract base class for shader compilers that use modular shader methods to assemble a
	 * material. Concrete subclasses are used by the default materials.
	 *
	 * @see away.materials.ShadingMethodBase
	 */
	export class ShaderCompilerBase
	{
		public _pShaderObject:ShaderObjectBase;
		public _pSharedRegisters:ShaderRegisterData;
		public _pRegisterCache:ShaderRegisterCache;
		public _pMaterialPass:IMaterialPassStageGL;
		public _pMaterial:MaterialBase;

		public _pVertexCode:string = ''; // Changed to emtpy string- AwayTS
		public _pFragmentCode:string = '';// Changed to emtpy string - AwayTS

		//The attributes that need to be animated by animators.
		public _pAnimatableAttributes:Array<string>;
		
		//The target registers for animated properties, written to by the animators.
		public _pAnimationTargetRegisters:Array<string>;

		//Indicates whether the compiled code needs UV animation.
		private _needUVAnimation:boolean;
		
		//The target register to place the animated UV coordinate.
		private _uvTarget:string;
		
		//The souce register providing the UV coordinate to animate.
		private _uvSource:string;

		public _pProfile:string;

		/**
		 * Creates a new ShaderCompilerBase object.
		 * @param profile The compatibility profile of the renderer.
		 */
		constructor(materialPassVO:MaterialPassVO, shaderObject:ShaderObjectBase)
		{
			this._pMaterialPass = materialPassVO.materialPass;
			this._pMaterial = materialPassVO.material;

			this._pShaderObject = shaderObject;
			this._pProfile = shaderObject.profile;

			this._pSharedRegisters = new ShaderRegisterData();

			this._pRegisterCache = new ShaderRegisterCache(this._pProfile);
			this._pRegisterCache.vertexAttributesOffset = 1;
			this._pRegisterCache.reset();
		}

		/**
		 * Compiles the code after all setup on the compiler has finished.
		 */
		public compile()
		{
			this._pShaderObject.reset();

			this.pCalculateDependencies();

			this.pInitRegisterIndices();

			//reserving vertex constants for projection matrix
			for (var i:number = 0; i < 4; ++i)
				this._pRegisterCache.getFreeVertexConstant();

			//compile the world-space position if required
			if (this._pShaderObject.globalPosDependencies > 0 || this._pMaterialPass.forceSeparateMVP) {
				this._pRegisterCache.addVertexTempUsages(this._pSharedRegisters.globalPositionVertex = this._pRegisterCache.getFreeVertexVectorTemp(), this._pShaderObject.globalPosDependencies);
				var positionMatrixReg:ShaderRegisterElement = this._pRegisterCache.getFreeVertexConstant();
				this._pRegisterCache.getFreeVertexConstant();
				this._pRegisterCache.getFreeVertexConstant();
				this._pRegisterCache.getFreeVertexConstant();
				this._pShaderObject.sceneMatrixIndex = positionMatrixReg.index*4;

				this._pVertexCode += "m44 " + this._pSharedRegisters.globalPositionVertex + ", " + this._pSharedRegisters.localPosition + ", " + positionMatrixReg + "\n";

				if (this._pShaderObject.usesGlobalPosFragment) {
					this._pSharedRegisters.globalPositionVarying = this._pRegisterCache.getFreeVarying();
					this._pVertexCode += "mov " + this._pSharedRegisters.globalPositionVarying + ", " + this._pSharedRegisters.globalPositionVertex + "\n";
				}
			}

			//get the projection coordinates
			var pos:string = (this._pShaderObject.globalPosDependencies > 0 || this._pMaterialPass.forceSeparateMVP)? this._pSharedRegisters.globalPositionVertex.toString() : this._pAnimationTargetRegisters[0];

			if (this._pShaderObject.projectionDependencies > 0) {
				this._pSharedRegisters.projectionFragment = this._pRegisterCache.getFreeVarying();
				this._pVertexCode += "m44 vt5, " + pos + ", vc0		\n" +
									"mov " + this._pSharedRegisters.projectionFragment + ", vt5\n" +
									"mov op, vt5\n";
			} else {
				this._pVertexCode += "m44 op, " + pos + ", vc0		\n";
			}

			this.pCompileDependencies();

			this.pCompileAnimation();
			
			//compile custom vertex & fragment codes
			this._pVertexCode += this._pMaterialPass._iGetVertexCode(this._pShaderObject, this._pRegisterCache, this._pSharedRegisters);
			this._pFragmentCode += this._pMaterialPass._iGetFragmentCode(this._pShaderObject, this._pRegisterCache, this._pSharedRegisters);


			//assign the final output color to the output register
			this._pFragmentCode += "mov " + this._pRegisterCache.fragmentOutputRegister + ", " + this._pSharedRegisters.shadedTarget + "\n";
			this._pRegisterCache.removeFragmentTempUsage(this._pSharedRegisters.shadedTarget);

			this._pShaderObject.initConstantData(this._pRegisterCache);
			this._pMaterialPass._iInitConstantData(this._pShaderObject);
		}

		/**
		 * Compile the code for the methods.
		 */
		public pCompileDependencies()
		{
			this._pSharedRegisters.shadedTarget = this._pRegisterCache.getFreeFragmentVectorTemp();
			this._pRegisterCache.addFragmentTempUsages(this._pSharedRegisters.shadedTarget, 1);

			//Calculate the (possibly animated) UV coordinates.
			if (this._pShaderObject.uvDependencies > 0)
				this.compileUVCode();

			if (this._pShaderObject.secondaryUVDependencies > 0)
				this.compileSecondaryUVCode();

			if (this._pShaderObject.normalDependencies > 0)
				this.compileNormalCode();

			if (this._pShaderObject.viewDirDependencies > 0)
				this.compileViewDirCode();
		}

		/**
		 * Calculate the (possibly animated) UV coordinates.
		 */
		private compileUVCode()
		{
			var uvAttributeReg:ShaderRegisterElement = this._pRegisterCache.getFreeVertexAttribute();
			this._pShaderObject.uvBufferIndex = uvAttributeReg.index;

			var varying:ShaderRegisterElement = this._pRegisterCache.getFreeVarying();

			this._pSharedRegisters.uvVarying = varying;

			if (this._pShaderObject.usesAnimatedUVs) {
				// a, b, 0, tx
				// c, d, 0, ty
				var uvTransform1:ShaderRegisterElement = this._pRegisterCache.getFreeVertexConstant();
				var uvTransform2:ShaderRegisterElement = this._pRegisterCache.getFreeVertexConstant();
				this._pShaderObject.uvTransformIndex = uvTransform1.index*4;

				this._pVertexCode += "dp4 " + varying + ".x, " + uvAttributeReg + ", " + uvTransform1 + "\n" +
									 "dp4 " + varying + ".y, " + uvAttributeReg + ", " + uvTransform2 + "\n" +
									 "mov " + varying + ".zw, " + uvAttributeReg + ".zw \n";
			} else {
				this._pShaderObject.uvTransformIndex = -1;
				this._needUVAnimation = true;
				this._uvTarget = varying.toString();
				this._uvSource = uvAttributeReg.toString();
			}
		}

		/**
		 * Provide the secondary UV coordinates.
		 */
		private compileSecondaryUVCode()
		{
			var uvAttributeReg:ShaderRegisterElement = this._pRegisterCache.getFreeVertexAttribute();
			this._pShaderObject.secondaryUVBufferIndex = uvAttributeReg.index;
			this._pSharedRegisters.secondaryUVVarying = this._pRegisterCache.getFreeVarying();
			this._pVertexCode += "mov " + this._pSharedRegisters.secondaryUVVarying + ", " + uvAttributeReg + "\n";
		}

		/**
		 * Calculate the view direction.
		 */
		public compileViewDirCode()
		{
			var cameraPositionReg:ShaderRegisterElement = this._pRegisterCache.getFreeVertexConstant();
			this._pSharedRegisters.viewDirVarying = this._pRegisterCache.getFreeVarying();
			this._pSharedRegisters.viewDirFragment = this._pRegisterCache.getFreeFragmentVectorTemp();
			this._pRegisterCache.addFragmentTempUsages(this._pSharedRegisters.viewDirFragment, this._pShaderObject.viewDirDependencies);

			this._pShaderObject.cameraPositionIndex = cameraPositionReg.index*4;

			if (this._pShaderObject.usesTangentSpace) {
				var temp:ShaderRegisterElement = this._pRegisterCache.getFreeVertexVectorTemp();
				this._pVertexCode += "sub " + temp + ", " + cameraPositionReg + ", " + this._pSharedRegisters.localPosition + "\n" +
					"m33 " + this._pSharedRegisters.viewDirVarying + ".xyz, " + temp + ", " + this._pSharedRegisters.animatedTangent + "\n" +
					"mov " + this._pSharedRegisters.viewDirVarying + ".w, " + this._pSharedRegisters.localPosition + ".w\n";
			} else {
				this._pVertexCode += "sub " + this._pSharedRegisters.viewDirVarying + ", " + cameraPositionReg + ", " + this._pSharedRegisters.globalPositionVertex + "\n";
				this._pRegisterCache.removeVertexTempUsage(this._pSharedRegisters.globalPositionVertex);
			}

			//TODO is this required in all cases? (re: distancemappass)
			this._pFragmentCode += "nrm " + this._pSharedRegisters.viewDirFragment + ".xyz, " + this._pSharedRegisters.viewDirVarying + "\n" +
				"mov " + this._pSharedRegisters.viewDirFragment + ".w,   " + this._pSharedRegisters.viewDirVarying + ".w\n";
		}

		/**
		 * Calculate the normal.
		 */
		public compileNormalCode()
		{
			this._pSharedRegisters.normalFragment = this._pRegisterCache.getFreeFragmentVectorTemp();
			this._pRegisterCache.addFragmentTempUsages(this._pSharedRegisters.normalFragment, this._pShaderObject.normalDependencies);

			//simple normal aquisition if no tangent space is being used
			if (this._pShaderObject.outputsNormals && !this._pShaderObject.outputsTangentNormals) {
				this._pVertexCode += this._pMaterialPass._iGetNormalFragmentCode(this._pShaderObject, this._pRegisterCache, this._pSharedRegisters);
				this._pFragmentCode += this._pMaterialPass._iGetNormalFragmentCode(this._pShaderObject, this._pRegisterCache, this._pSharedRegisters);

				return;
			}

			var normalMatrix:Array<ShaderRegisterElement>;

			if (!this._pShaderObject.outputsNormals || !this._pShaderObject.usesTangentSpace) {
				normalMatrix = new Array<ShaderRegisterElement>(3);
				normalMatrix[0] = this._pRegisterCache.getFreeVertexConstant();
				normalMatrix[1] = this._pRegisterCache.getFreeVertexConstant();
				normalMatrix[2] = this._pRegisterCache.getFreeVertexConstant();

				this._pRegisterCache.getFreeVertexConstant();

				this._pShaderObject.sceneNormalMatrixIndex = normalMatrix[0].index*4;

				this._pSharedRegisters.normalVarying = this._pRegisterCache.getFreeVarying();
			}

			if (this._pShaderObject.outputsNormals) {
				if (this._pShaderObject.usesTangentSpace) {
					// normalize normal + tangent vector and generate (approximated) bitangent
					this._pVertexCode += "nrm " + this._pSharedRegisters.animatedNormal + ".xyz, " + this._pSharedRegisters.animatedNormal + "\n" +
						"nrm " + this._pSharedRegisters.animatedTangent + ".xyz, " + this._pSharedRegisters.animatedTangent + "\n" +
						"crs " + this._pSharedRegisters.bitangent + ".xyz, " + this._pSharedRegisters.animatedNormal + ", " + this._pSharedRegisters.animatedTangent + "\n";

					this._pFragmentCode += this._pMaterialPass._iGetNormalFragmentCode(this._pShaderObject, this._pRegisterCache, this._pSharedRegisters);
				} else {
					//Compiles the vertex shader code for tangent-space normal maps.
					this._pSharedRegisters.tangentVarying = this._pRegisterCache.getFreeVarying();
					this._pSharedRegisters.bitangentVarying = this._pRegisterCache.getFreeVarying();
					var temp:ShaderRegisterElement = this._pRegisterCache.getFreeVertexVectorTemp();

					this._pVertexCode += "m33 " + temp + ".xyz, " + this._pSharedRegisters.animatedNormal + ", " + normalMatrix[0] + "\n" +
						"nrm " + this._pSharedRegisters.animatedNormal + ".xyz, " + temp + "\n" +
						"m33 " + temp + ".xyz, " + this._pSharedRegisters.animatedTangent + ", " + normalMatrix[0] + "\n" +
						"nrm " + this._pSharedRegisters.animatedTangent + ".xyz, " + temp + "\n" +
						"mov " + this._pSharedRegisters.tangentVarying + ".x, " + this._pSharedRegisters.animatedTangent + ".x  \n" +
						"mov " + this._pSharedRegisters.tangentVarying + ".z, " + this._pSharedRegisters.animatedNormal + ".x  \n" +
						"mov " + this._pSharedRegisters.tangentVarying + ".w, " + this._pSharedRegisters.normalInput + ".w  \n" +
						"mov " + this._pSharedRegisters.bitangentVarying + ".x, " + this._pSharedRegisters.animatedTangent + ".y  \n" +
						"mov " + this._pSharedRegisters.bitangentVarying + ".z, " + this._pSharedRegisters.animatedNormal + ".y  \n" +
						"mov " + this._pSharedRegisters.bitangentVarying + ".w, " + this._pSharedRegisters.normalInput + ".w  \n" +
						"mov " + this._pSharedRegisters.normalVarying + ".x, " + this._pSharedRegisters.animatedTangent + ".z  \n" +
						"mov " + this._pSharedRegisters.normalVarying + ".z, " + this._pSharedRegisters.animatedNormal + ".z  \n" +
						"mov " + this._pSharedRegisters.normalVarying + ".w, " + this._pSharedRegisters.normalInput + ".w  \n" +
						"crs " + temp + ".xyz, " + this._pSharedRegisters.animatedNormal + ", " + this._pSharedRegisters.animatedTangent + "\n" +
						"mov " + this._pSharedRegisters.tangentVarying + ".y, " + temp + ".x    \n" +
						"mov " + this._pSharedRegisters.bitangentVarying + ".y, " + temp + ".y  \n" +
						"mov " + this._pSharedRegisters.normalVarying + ".y, " + temp + ".z    \n";

					this._pRegisterCache.removeVertexTempUsage(this._pSharedRegisters.animatedTangent);

					//Compiles the fragment shader code for tangent-space normal maps.
					var t:ShaderRegisterElement;
					var b:ShaderRegisterElement;
					var n:ShaderRegisterElement;

					t = this._pRegisterCache.getFreeFragmentVectorTemp();
					this._pRegisterCache.addFragmentTempUsages(t, 1);
					b = this._pRegisterCache.getFreeFragmentVectorTemp();
					this._pRegisterCache.addFragmentTempUsages(b, 1);
					n = this._pRegisterCache.getFreeFragmentVectorTemp();
					this._pRegisterCache.addFragmentTempUsages(n, 1);

					this._pFragmentCode += "nrm " + t + ".xyz, " + this._pSharedRegisters.tangentVarying + "\n" +
						"mov " + t + ".w, " + this._pSharedRegisters.tangentVarying + ".w	\n" +
						"nrm " + b + ".xyz, " + this._pSharedRegisters.bitangentVarying + "\n" +
						"nrm " + n + ".xyz, " + this._pSharedRegisters.normalVarying + "\n";

					//compile custom fragment code for normal calcs
					this._pFragmentCode += this._pMaterialPass._iGetNormalFragmentCode(this._pShaderObject, this._pRegisterCache, this._pSharedRegisters) +
						"m33 " + this._pSharedRegisters.normalFragment + ".xyz, " + this._pSharedRegisters.normalFragment + ", " + t + "\n" +
						"mov " + this._pSharedRegisters.normalFragment + ".w, " + this._pSharedRegisters.normalVarying + ".w\n";

					this._pRegisterCache.removeFragmentTempUsage(b);
					this._pRegisterCache.removeFragmentTempUsage(t);
					this._pRegisterCache.removeFragmentTempUsage(n);
				}
			} else {
				// no output, world space is enough
				this._pVertexCode += "m33 " + this._pSharedRegisters.normalVarying + ".xyz, " + this._pSharedRegisters.animatedNormal + ", " + normalMatrix[0] + "\n" +
					"mov " + this._pSharedRegisters.normalVarying + ".w, " + this._pSharedRegisters.animatedNormal + ".w\n";

				this._pFragmentCode += "nrm " + this._pSharedRegisters.normalFragment + ".xyz, " + this._pSharedRegisters.normalVarying + "\n" +
					"mov " + this._pSharedRegisters.normalFragment + ".w, " + this._pSharedRegisters.normalVarying + ".w\n";
			}

			if (this._pShaderObject.tangentDependencies > 0 && (!this._pShaderObject.outputsNormals || this._pShaderObject.usesTangentSpace)) {
				this._pSharedRegisters.tangentInput = this._pRegisterCache.getFreeVertexAttribute();
				this._pShaderObject.tangentBufferIndex = this._pSharedRegisters.tangentInput.index;
				this._pSharedRegisters.tangentVarying = this._pRegisterCache.getFreeVarying();

				this._pVertexCode += "mov " + this._pSharedRegisters.tangentVarying + ", " + this._pSharedRegisters.tangentInput + "\n";
			}

			this._pRegisterCache.removeVertexTempUsage(this._pSharedRegisters.animatedNormal);
		}
		
		public pCompileAnimation()
		{
			//add animation code
			var animatorCode:string = "";
			var UVAnimatorCode:string = "";

			if (this._pShaderObject.usesAnimation) {

				var animationset:AnimationSetBase = <AnimationSetBase> this._pMaterial.animationSet;
				animatorCode = animationset.getAGALVertexCode(this._pShaderObject, this._pAnimatableAttributes, this._pAnimationTargetRegisters, this._pProfile);

				if (this._pShaderObject.usesFragmentAnimation)
					this._pFragmentCode += animationset.getAGALFragmentCode(this._pShaderObject, this._pSharedRegisters.shadedTarget, this._pProfile);

				if (this._needUVAnimation)
					UVAnimatorCode = animationset.getAGALUVCode(this._pShaderObject, this._uvSource, this._uvTarget);

				animationset.doneAGALCode(this._pShaderObject);

			} else {
				var len:number = this._pAnimatableAttributes.length;

				// simply write attributes to targets, do not animate them
				// projection will pick up on targets[0] to do the projection
				for (var i:number = 0; i < len; ++i)
					animatorCode += "mov " + this._pAnimationTargetRegisters[i] + ", " + this._pAnimatableAttributes[i] + "\n";

				if (this._needUVAnimation)
					UVAnimatorCode = "mov " + this._uvTarget + "," + this._uvSource + "\n";
			}

			this._pVertexCode = animatorCode + UVAnimatorCode + this._pVertexCode;

		}
		
		/**
		 * Reset all the indices to "unused".
		 */
		public pInitRegisterIndices()
		{
			this._pShaderObject.pInitRegisterIndices();

			this._pAnimatableAttributes = new Array<string>("va0");
			this._pAnimationTargetRegisters = new Array<string>("vt0");
			this._pVertexCode = "";
			this._pFragmentCode = "";

			this._pRegisterCache.addVertexTempUsages(this._pSharedRegisters.localPosition = this._pRegisterCache.getFreeVertexVectorTemp(), 1);

			//create commonly shared constant registers
			this._pSharedRegisters.commons = this._pRegisterCache.getFreeFragmentConstant();
			this._pShaderObject.commonsDataIndex = this._pSharedRegisters.commons.index*4;

			//Creates the registers to contain the normal data.
			if (this._pShaderObject.usesTangentSpace) {
				this._pSharedRegisters.animatedTangent = this._pRegisterCache.getFreeVertexVectorTemp();
				this._pRegisterCache.addVertexTempUsages(this._pSharedRegisters.animatedTangent, 1);
				this._pSharedRegisters.bitangent = this._pRegisterCache.getFreeVertexVectorTemp();
				this._pRegisterCache.addVertexTempUsages(this._pSharedRegisters.bitangent, 1);

				this._pSharedRegisters.tangentInput = this._pRegisterCache.getFreeVertexAttribute();
				this._pShaderObject.tangentBufferIndex = this._pSharedRegisters.tangentInput.index;

				this._pAnimatableAttributes.push(this._pSharedRegisters.tangentInput.toString());
				this._pAnimationTargetRegisters.push(this._pSharedRegisters.animatedTangent.toString());
			}

			if (this._pShaderObject.normalDependencies > 0) {
				this._pSharedRegisters.normalInput = this._pRegisterCache.getFreeVertexAttribute();
				this._pShaderObject.normalBufferIndex = this._pSharedRegisters.normalInput.index;

				this._pSharedRegisters.animatedNormal = this._pRegisterCache.getFreeVertexVectorTemp();
				this._pRegisterCache.addVertexTempUsages(this._pSharedRegisters.animatedNormal, 1);

				this._pAnimatableAttributes.push(this._pSharedRegisters.normalInput.toString());
				this._pAnimationTargetRegisters.push(this._pSharedRegisters.animatedNormal.toString());
			}
		}

		/**
		 * Figure out which named registers are required, and how often.
		 */
		public pCalculateDependencies()
		{
			this._pShaderObject.useAlphaPremultiplied = this._pMaterial.alphaPremultiplied;
			this._pShaderObject.useBothSides = this._pMaterial.bothSides;
			this._pShaderObject.useMipmapping = this._pMaterial.mipmap;
			this._pShaderObject.useSmoothTextures = this._pMaterial.smooth;
			this._pShaderObject.repeatTextures = this._pMaterial.repeat;
			this._pShaderObject.usesAnimation = this._pMaterial.animationSet && !this._pMaterial.animationSet.usesCPU;
			this._pShaderObject.usesAnimatedUVs = this._pMaterial.animateUVs;
			this._pShaderObject.alphaThreshold = this._pMaterial.alphaThreshold;

			this._pMaterialPass._iIncludeDependencies(this._pShaderObject);
		}

		/**
		 * Disposes all resources used by the compiler.
		 */
		public dispose()
		{
			this._pRegisterCache.dispose();
			this._pRegisterCache = null;
			this._pSharedRegisters = null;
		}

		/**
		 * The generated vertex code.
		 */
		public get vertexCode():string
		{
			return this._pVertexCode;
		}

		/**
		 * The generated fragment code.
		 */
		public get fragmentCode():string
		{
			return this._pFragmentCode;
		}
	}
}