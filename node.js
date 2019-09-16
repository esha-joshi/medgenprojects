//: Base Node classes

import {NodeTagDictionary} from './NodeTag.js'
import {CONSTANTS} from './constants.js'



/**
 * Base class for all nodes that get drawn in a paperjs canvas.
 * @memberOf module:Node
 */
class Node{
	constructor(args){
		this.name = 'Node';
		this.type = '_node'
		this.details = {}
		this.tags =[];
		this._onCallbacks = {
			'create': [],
			'input_connected': [],
			'input_disconnected': [],
			'output_connected': [],
			'output_disconnected': [],
			'remove': []
		};
		this._inputs = [];
		this._outputs = [];

		this._paperScope = {};
		({scope: this._paperScope} = {
			scope: args.scope.constructor === paper.PaperScope 
			? args.scope 
			: () => { throw new Error('Given scope is not a PaperScope') }
		})
		this._use_mongo_id = false;
		this._uid = null

		//Set details based on args
		if(('details' in args) && args['details'] != undefined){
			this.details = args['details'];
		}
		
		//Set parameters based on args
		if(('parameters' in args) && args['parameters'] != undefined){
			this.parameters = args['parameters'];
		}
		
		//TODO: proper checking on given mongo id
		if(('set_mongo_id' in args) && args['set_mongo_id'] != undefined){
			this._use_mongo_id = true;
			this._uid = args['set_mongo_id'];
		}

		//: enabling mongo-id mode
		if(('use_mongo_id' in args) && args['use_mongo_id'] == true){
			this._use_mongo_id = true;			
		}
		else{
			this._uid = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
			    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))
		}

        this._dimensions = {}
		for (let key in CONSTANTS.DEFAULT_NODE_RECTANGLE){
			if (key in args){
				this._dimensions[key] = args[key]
			}
			else {
				this._dimensions[key] = CONSTANTS.DEFAULT_NODE_RECTANGLE[key]
			}
		}

		this._paperScope.activate()
		this._nodeGroup = new this._paperScope.Group();
		this._nodeGroup.data['instance'] = this;
		this.drawNode();
		this._nodeGroup.position = new this._paperScope.Point(this._dimensions.x, this._dimensions.y);

		this.linkEvents();
	
	}
	initialize(){
		if(this._use_mongo_id && (this._uid == null)){
			$.post('create-node', {type: this.type}, (data)=>{
				console.log(data)
				if(data['success']){
					this._uid = data['uid']['$oid'];
					this.call('create', this);			
				}
				else{
					throw "Error creating node"
				}
			})	
		}
		else{
			this.call('create', this);
		}
	}
	on(eventname, callback){
		if(eventname in this._onCallbacks){	
			this._onCallbacks[eventname].push(callback);						
		}		
	}

	call(eventname, ...args){
		if(eventname in this._onCallbacks){	
			this._onCallbacks[eventname].forEach((callbk)=>{
				callbk(...args);
			});						
		}	
	}

	getUid(){
		return this._uid;
	}
	hasMongoId(){
		if(this._use_mongo_id && (this._uid !=null)){
			return true;
		}
		else{
			return false;
		}		
	}
	getNodeGroup(){
		return this._nodeGroup;
	}
	getNodeShape(){
		return this._nodeShape;
	}
	setNodeShape(shape){
		if(shape.constructor === paper.Path){
			this._nodeShape.remove();
			this._nodeShape = shape;
			this._nodeGroup.appendBottom(shape)
		} 
	}
	setPosition(pos){		
		this._nodeGroup.position.x = 'x' in pos ? pos.x : this._nodeGroup.position.x;
		this._nodeGroup.position.y = 'y' in pos ? pos.y : this._nodeGroup.position.y;
	}
	setName(name){
		this.name = name;
		for (var i = this.tags.length - 1; i >= 0; i--) {
			if(this.tags[i].constructor.name=="NameTag"){
					this.tags[i].setText(name);  
			};
		};
	}
	drawNode(){
		this.drawShape();
		this.addTag('NameTag', {text: this.name, position: this.getPoint({x:0.5, y:0.5}) })
                
        // add info and parameter icons to nodes
        if(this.details){
			this.addTag('InfoAttributeTag', {position: this.getPoint({x:0.85, y:0.825})})
		};
		
        if(this.parameters){
			this.addTag('ParameterAttributeTag', {position: this.getPoint({x:0.7, y:0.825})})
		};
        
    }
	
    drawShape(){
		let size = new this._paperScope.Size(this._dimensions.width, this._dimensions.height);

		this._nodeShape = new this._paperScope.Path.RoundRectangle(new this._paperScope.Rectangle({x:0, y:0}, size), 20);		
		this._nodeShape.fillColor = 'black';

		this._nodeGroup.addChild(this._nodeShape)
		
		this._nodeGroup.on('mousedrag', (event)=>{
                        event.stopPropagation();
			this._nodeGroup.position = event.point.subtract(this._nodeShape.position.subtract(this._nodeGroup.position));
		})

		
	}

	getPoint(ratioCoords){
		let boundsX = this._nodeShape.bounds.width * ('x' in ratioCoords ? ratioCoords.x : 0 ) + this._nodeShape.bounds.left;
		let boundsY = this._nodeShape.bounds.height * ('y' in ratioCoords ? ratioCoords.y : 0 ) + this._nodeShape.bounds.top;
		let toReturn = new this._paperScope.Point(boundsX, boundsY);
		return toReturn;

	}

	addTag(type, args){
		if(!(type in NodeTagDictionary)){
			type = "NodeTag"
		}
		args['scope'] = this._paperScope;
		args['node'] = this; 
		this.tags.push(new NodeTagDictionary[type](args));

	}
	removeTag(type, args){
		for (let i = this.tags.length - 1; i >= 0; i--) {
			if (type == this.tags[i].constructor.name){
				this.tags[i].remove()
			}
		}
	}

	//TODO: rewrite this better
	linkEvents(){
		this.on('input_connected', (link)=>{
			for (var i = this._inputs.length - 1; i >= 0; i--) {
				if (link.node == this._inputs[i].node && link.type == this._inputs[i].type){
					throw 'Duplicate input link'
				}
			}
			this._inputs.push(link);
			if(this._uid!=null){
				this.syncNodeState(true);
			}
		})
		this.on('input_disconnected', (link)=>{
			let removedLink = null;
			for (var i = this._inputs.length - 1; i >= 0; i--) {
				if (link.node == this._inputs[i].node && link.type == this._inputs[i].type){
					removedLink = this._inputs.splice(i,1);
				}
			}
			if(removedLink == null){
				throw 'No link disconnected';
			}
			if(this._uid!=null){
				this.syncNodeState(true);
			}
		})

		this.on('output_connected', (link)=>{
			for (var i = this._outputs.length - 1; i >= 0; i--) {
				if (link.node == this._outputs[i].node && link.type == this._outputs[i].type){
					throw 'Duplicate output link'
				}
			}
			this._outputs.push(link);
			if(this._uid!=null){
				this.syncNodeState();
			}
		})
		this.on('output_disconnected', (link)=>{
			let removedLink = null;
			for (var i = this._outputs.length - 1; i >= 0; i--) {
				if (link.node == this._outputs[i].node && link.type == this._outputs[i].type){
					removedLink = this._outputs.splice(i,1);
				}
			}
			if(removedLink == null){
				throw 'No link disconnected';
			}
			if(this._uid!=null){
				this.syncNodeState();
			}
		})

	}
	syncNodeState(needs_update){
		if(this._use_mongo_id){
			let syncJson = {inputs: [], outputs:[], node_uid:null};
			needs_update != undefined ? syncJson['needs_update'] = needs_update: null
			syncJson['inputs'] = this._inputs.map((input)=>{return{node: input.node.getUid(), type: input.type}});
			syncJson['outputs'] = this._outputs.map((output)=>{return{node: output.node.getUid(), type: output.type}});
			syncJson['node_uid'] = this.getUid();
			syncJson['parameters'] = this.parameters;


			$.ajax({
			  type: "POST",
			  contentType: "application/json; charset=utf-8",
			  url: "sync-node",
			  data: JSON.stringify(syncJson),
			  dataType: "json"
			})
			.done((data)=>{			  	
				if(!data['success']){

					throw "Node syncing error";
				}
				else{
					//if this node doesnt need an update, make it available for download
					if(!data['document']['needs_update']){
						this.addTag('DownloadAttributeTag', {position: this.getPoint({x:0.15, y:0.825})})
						console.log(data)
					}
					//else,  remove its download button
					else{
						this.removeTag('DownloadAttributeTag', {})
					}

					//for each connected output
					this._outputs.forEach((output)=>{
						//update needs to be propigated to outputs
						if(data['document']['needs_update']){
							output['node'].syncNodeState(true)
						}

						//process the output node if its also in the list to process
						data['nodes_to_process'].forEach((node)=>{
							if(output['node'].getUid() ==node['_id']['$oid']){
								output['node'].syncNodeState()
							}
						})
					})
				}
			 });
		}
	}
	disable(){
		this.tags.forEach((tag)=>{
			tag.disable();
		})
	}
	remove(){
		this.tags.forEach((tag)=>{
			tag.remove();
		})
		this._nodeGroup.remove()
	}
	getOutputTags(){
		let tag_list = this.tags.filter((tag)=>{
			if(tag.constructor.name.indexOf('OutputConnector')>-1){
				return true
			}
			else{
				return false
			}
		})
		return tag_list
	}
	getInputTags(){
		let tag_list = this.tags.filter((tag)=>{
			if(tag.constructor.name.indexOf('InputTag')>-1){
				return true
			}
			else{
				return false
			}
		})
		return tag_list
	}
}

class InputNode extends Node{
	drawNode(args){
		super.drawNode(args)
		this._nodeShape.style = {
			fillColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_INPUT_COLOR, 0.3),
			strokeColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_INPUT_COLOR),
			strokeWidth: 2
		}
	}
	setName(name){
		this.name = name;
		
		// console.log(name);
		
		for (var i = this.tags.length - 1; i >= 0; i--) {
			if(this.tags[i].constructor.name=="NameTag"){
				/* Format name to overflow in the node */
				name = this.type.replace('_', ' ') + ': ' + this.name;
				
				/* This will control the text formatting to fit in the node. 
				var context = this._paperScope.view.element.getContext("2d");
				
				var stringArray = name.split(' ');
				var textRows = [];
				var tempString = '';
				
				for(var j=0; j < stringArray.length; j++){
					if(context.measureText(tempString + ' ' + stringArray[i])['width'] > this._dimensions.width-20){ // value of 20 to account for input connectors
						tempString += '\n'
						textRows.push(tempString);
						tempString = stringArray[i];	
					} else {
						if(tempString == ''){
							tempString = stringArray[i];
						} else {
							tempString += ' ' + stringArray[i];
						};
					};
				};
				var formattedString = textRows.join('');
				*/
				this.tags[i].setText(name);  
			}; 
		};
	};
}

class ModuleNode extends Node{
	drawNode(args){
		super.drawNode(args)
		this._nodeShape.style = {
			fillColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_MODULE_COLOR, 0.3),
			strokeColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_MODULE_COLOR),
			strokeWidth: 2
		}
	}

}

class OperationNode extends Node{
	drawNode(args){
		super.drawNode(args)
		this._nodeShape.style = {
			fillColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_MODULE_COLOR, 0.3),
			strokeColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_MODULE_COLOR),
			strokeWidth: 2
		}
	}

}

class OutputNode extends Node{
	drawNode(args){
		super.drawNode(args)
		this._nodeShape.style = {
			fillColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_OUTPUT_COLOR, 0.3),
			strokeColor: new this._paperScope.Color(...CONSTANTS.DEFAULT_OUTPUT_COLOR),
			strokeWidth: 2
		}
	}

}



//: Input Nodes
class PhenotypeListNode extends InputNode{
	drawNode(args){
		this.name = "Phenotype List";
		this.header = CONSTANTS.PHENOTYPE_HEADER;
		this.type = "phenotype_list";		
        this.details = {"Description": "List of phenotypes as specified by the user."}
		super.drawNode(args);
		this.addTag('PhenotypeListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}

class GeneListNode extends InputNode{
	drawNode(args){
		this.name = "Gene List";
		this.header = CONSTANTS.GENE_HEADER;
		this.type = "gene_list";
        this.details = {"Descriptions": "List of genes as specified by the user."}
		super.drawNode(args);
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}

class TissueListNode extends InputNode{
	drawNode(args){
		this.name = "Tissue List";
		this.header = CONSTANTS.TISSUE_HEADER;
		this.type = "tissue_list";
        this.details = {"Description":"List of tissues as specified by the user."}
		super.drawNode(args);
		this.addTag('TissueListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}

class VCFNode extends InputNode{
	drawNode(args){
		this.name = "VCF File";
        this.details = {"Description": "VCF file uploaded by the user containing the patients' variants that can be annotated by the VIP module."}
		this.type = "vcf_file";
		super.drawNode(args);
		this.addTag('VCFLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}


//: Module Nodes
class ExphenosionNode extends ModuleNode{
	drawNode(args){
		this.name = "Exphenosion";
		this.type = "exphenosion_module";
        this.details = {
                "description": "ExPhenosion finds medical terms, diseases and genes related to an inputted query term (either tissue type or phenotype), using both HPO and MeSH databases.",
                "input": "phenotype list",
                "output": ["gene list", "phenotype list"]
		}
		this.parameters = {
			'Weight': 1,
		};
		
		super.drawNode(args);
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('PhenotypeListLink', {position: this.getPoint({x: 1, y: 0.33})})
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.66})})
	}

}   


class ZebrafishNode extends ModuleNode{
	drawNode(args){
		this.name = "Cross-species: Zebrafish";
		this.type = "zebrafish_module";
        this.details = {
                "description": "Uses inputted phenotype to find related genes in zebrafish that are expressed. Returns equivalent human genes.",
                "input": "phenotype list",
                "output": "gene list",
                "database_name": ["monarch initaitive", "ZFIN"],
				/*"database_link": [
					"https://solr.monarchinitiative.org/solr/gol/select/?defType=edismax&qt=standard&indent=on&wt=csv&rows=100000&start=0&fl=subject,subject_label,subject_taxon,subject_taxon_label,object,object_label,relation,relation_label,evidence,evidence_label,source,is_defined_by,qualifier&facet=true&facet.mincount=1&facet.sort=count&json.nl=arrarr&facet.limit=25&facet.method=enum&csv.encapsulator=%22&csv.separator=%09&csv.header=true&csv.mv.separator=%7C&fq=subject_category:%22gene%22&fq=object_closure:%22HP:0001626%22&fq=subject_taxon_label:%22Danio%20rerio%22&facet.field=subject_taxon_label&q=*:*https://zfin.org/downloads/ortho.txt"
				]*/
		}
		this.parameters = {
			'Weight': 1,
		};
		
		super.drawNode(args);
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}
    
class MouseNode extends ModuleNode{
	drawNode(args){
		this.name = "Cross-species: Mouse";
		this.type = "mouse_module";
        this.details = {
                "description": "Uses the inputted phenotype to find related mouse genes that are expressed. Returns equivalent human genes.",
                "input": "tissue list",
                "output": "gene list",
                "database_name": "MGI",
                /*"database_link": [
                    "http://www.informatics.jax.org/downloads/reports/MGI_DO.rpt",
                    "http://www.informatics.jax.org/downloads/reports/HMD_HumanPhenotype.rpt"
                ]*/
		}
		this.parameters = {
			'Weight': 1,
		};
		
		super.drawNode(args);
		this.addTag('TissueListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}
   
class GeneExpressionNode extends ModuleNode{
	drawNode(args){
		this.name = "Gene Expression";
		this.type = "expression_module";
        this.details = {
                "description": "Finds gene(s) expressed in the user inputted tissue type, by consulting EBI database.",
                "input": "tissue list",
                "output": "gene list",
                "database_name": "EBI",
                "database_link": "N/A"
		}
		this.parameters = {
			'Weight': 1,
			'Threshold': 0.5,
		};
		
		super.drawNode(args);
		this.addTag('TissueListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}

class PPINode extends ModuleNode{
	drawNode(args){
		this.name = "Protein-Protein Interaction";
		this.type = "ppi_module";
        this.details = {
                "description": "Fetches genes that have protein-protein interation with the given input genes.",
                "input": "gene list",
                "output": "gene list",
                "database_name": "The BioGRID",
                /*"database_link": "https://downloads.thebiogrid.org/Download/BioGRID/Latest-Release/BIOGRID-ORGANISM-LATEST.tab2.zip"*/
		}
		this.parameters = {
			'Weight': 1,
			'Links': 1,
		};
		
		super.drawNode(args);
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}
   
class HomologyNode extends ModuleNode{
	drawNode(args){
		this.name = "Homology";
		this.type = "homology_module";
        this.details = {
                "description": "Fetches paralogue genes of the given input genes.",
                "input": "gene list",
                "output": "gene list",
                "database_name": "Ensembl",
                /*"database_link": "http://www.ensembl.org/biomart/martservice?query=%3C?xml%20version=%221.0%22%20encoding=%22UTF-8%22?%3E%20%3C!DOCTYPE%20Query%3E%20%3CQuery%20virtualSchemaName%20=%20%22default%22%20formatter%20=%20%22TSV%22%20header%20=%20%221%22%20uniqueRows%20=%20%220%22%20count%20=%20%22%22%20datasetConfigVersion%20=%20%220.6%22%20%3E%20%3CDataset%20name%20=%20%22hsapiens_gene_ensembl%22%20interface%20=%20%22default%22%20%3E%20%3CAttribute%20name%20=%20%22ensembl_gene_id%22%20/%3E%20%3CAttribute%20name%20=%20%22external_gene_name%22%20/%3E%20%3CAttribute%20name%20=%20%22hsapiens_paralog_ensembl_gene%22%20/%3E%20%3CAttribute%20name%20=%20%22hsapiens_paralog_associated_gene_name%22%20/%3E%20%3CAttribute%20name%20=%20%22hsapiens_paralog_perc_id%22%20/%3E%20%3CAttribute%20name%20=%20%22hsapiens_paralog_perc_id_r1%22%20/%3E%20%3C/Dataset%3E%20%3C/Query%3E"*/
		}
		this.parameters = {
			'Weight': 1,
		};
		
		super.drawNode(args);
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('GeneListLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}
   

class VIPNode extends ModuleNode{
	drawNode(args){
		this.name = "VIP";
		this.type = "vip_module";
        this.details = {
                "description": "Establishes and appends pathogenicity data to the given vcf file.",
                "input": "vcf file",
                "output": "vcf file"
		}
		super.drawNode(args);
		this.addTag('VCFInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('VCFLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}
    
class VariantValidityNode extends ModuleNode{
	drawNode(args){
		this.name = "Variant Validity";
		this.type = "validity_module";
        this.details = {
                "description": "Consolidates the given gene lists and appends score to each gene based on frequency and weights.",
                "input": ["gene list", "vcf file"],
                "output": "vcf file"
		}
		super.drawNode(args);
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.33})})
		this.addTag('VCFInputTag', {position: this.getPoint({x: 0, y: 0.66})})
		this.addTag('VCFLink', {position: this.getPoint({x: 1, y: 0.5})})
	}

}

//: Operation Nodes
class IntersectionNode extends OperationNode{
	drawNode(args){
		this.name = "Intersection";
		this.type = "intersection_operation";
        this.details = {
                "description": "Returns only genes appearing in all inputs.",
                "input": "gene list",
                "output": "gene list"
		}
		super.drawNode(args);
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.33})})
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.33})})
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.66})})
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.66})})
	}

}

class UnionNode extends OperationNode{
	drawNode(args){
		this.name = "Union";
		this.type = "union_operation";
        this.details = {
                "description": "Returns all genes appearing in all inputs.",
                "input": "gene list",
                "output": "gene list"
		}
		super.drawNode(args);
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.33})})
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.33})})
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.66})})
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.66})})
	}
	
}

//: Output Nodes

//LEGACY
class DownloadNode extends OutputNode{
	drawNode(args){
		this.name = "Download";
		this.type = "download_output";
        this.details = {
                "description": "Download the output file of this nodes input.",
                "input": ["gene list", "annotated gene list", "phenotype list", "vcf file"]
		}
		super.drawNode(args);
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('PhenotypeListInputTag', {position: this.getPoint({x: 0, y: 0.5})})
		this.addTag('VCFInputTag', {position: this.getPoint({x: 0, y: 0.5})})
	}

}

class CausalityNode extends OutputNode{
	drawNode(args){
		this.name = "Causality";
		this.type = "causality_output";
        this.details = {
                "description": "Generates a graph visualization comparing variant validity and pathogenicity.",
                "input": ["vfc file", "annotated gene list"]
		}
		super.drawNode(args);
		this.addTag('VCFInputTag', {position: this.getPoint({x: 0, y: 0.33})})
		this.addTag('GeneListInputTag', {position: this.getPoint({x: 0, y: 0.66})})
	}

}

export let NodeDictionary = {	
	"Node": Node, 
	"InputNode": InputNode, 
	"ModuleNode": ModuleNode, 
	"OperationNode": OperationNode, 
	"OutputNode": OutputNode, 
	"PhenotypeListNode": PhenotypeListNode, 
	"GeneListNode": GeneListNode, 
	"TissueListNode": TissueListNode, 
	"VCFNode": VCFNode, 
	"ExphenosionNode": ExphenosionNode, 
	"ZebrafishNode": ZebrafishNode, 
	"MouseNode": MouseNode, 
	"GeneExpressionNode": GeneExpressionNode, 
	"PPINode": PPINode, 
	"HomologyNode": HomologyNode, 
	"VIPNode": VIPNode, 
	"VariantValidityNode": VariantValidityNode, 
	"IntersectionNode": IntersectionNode, 
	"UnionNode": UnionNode, 
	"DownloadNode": DownloadNode, 
	"CausalityNode": CausalityNode, 
}
