import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { RNG } from './rng';
import { blocks, resources } from './blocks';

const geometry = new THREE.BoxGeometry();

export class WorldChunk extends THREE.Group {
    data = [];

    constructor(size, params, dataStore) {
        super();
        this.loaded = false;
        this.size = size;
        this.params = params;
        this.dataStore = dataStore;
    }

    generate() {
        const rng = new RNG(this.params.seed);
        this.initializeTerrain();
        this.generateTerrain(rng);
        this.generateClouds(rng);
        this.loadPlayerChanges();
        this.generateMeshes();
        this.loaded = true;
    }

    initializeTerrain() {
        this.data = [];
        for (let x = 0; x < this.size.width; x++) {
            const slice = [];
            for (let y = 0; y < this.size.height; y++) {
                const row = [];
                for (let z = 0; z < this.size.width; z++) {
                    row.push({ id: blocks.empty.id, instanceId: null });
                }
                slice.push(row);
            }
            this.data.push(slice);
        }
    }

    getBiome(simplex, x, z) {
        let noise = 0.5 * simplex.noise(
            (this.position.x + x) / this.params.biomes.scale,
            (this.position.z + z) / this.params.biomes.scale
        ) + 0.5;

        noise += this.params.biomes.variation.amplitude * simplex.noise(
            (this.position.x + x) / this.params.biomes.variation.scale,
            (this.position.z + z) / this.params.biomes.variation.scale
        );

        if (noise < this.params.biomes.tundraToTemperate) return 'Tundra';
        else if (noise < this.params.biomes.temperateToJungle) return 'Temperate';
        else if (noise < this.params.biomes.jungleToDesert) return 'Jungle';
        else return 'Desert';
    }

    generateTerrain(rng) {
        const simplex = new SimplexNoise(rng);
        for (let x = 0; x < this.size.width; x++) {
            for (let z = 0; z < this.size.width; z++) {
                const biome = this.getBiome(simplex, x, z);
                const value = simplex.noise(
                    (this.position.x + x) / this.params.terrain.scale,
                    (this.position.z + z) / this.params.terrain.scale
                );
                let height = Math.floor(this.params.terrain.offset + this.params.terrain.magnitude * value);
                height = Math.max(0, Math.min(height, this.size.height - 1));

                for (let y = this.size.height; y >= 0; y--) {
                    if (y <= this.params.terrain.waterOffset && y === height) {
                        this.setBlockId(x, y, z, blocks.sand.id);
                    } else if (y === height) {
                        let groundBlockType;
                        if (biome === 'Desert') groundBlockType = blocks.sand.id;
                        else if (biome === 'Temperate' || biome === 'Jungle') groundBlockType = blocks.grass.id;
                        else if (biome === 'Tundra') groundBlockType = blocks.snow.id;
                        this.setBlockId(x, y, z, groundBlockType);
                        if (rng.random() < this.params.trees.frequency) this.generateTree(rng, biome, x, height + 1, z);
                    } else if (y < height && this.getBlock(x, y, z).id === blocks.empty.id) {
                        this.generateResourceIfNeeded(simplex, x, y, z);
                    }
                }
            }
        }
    }

    generateResourceIfNeeded(simplex, x, y, z) {
        this.setBlockId(x, y, z, blocks.dirt.id);
        resources.forEach(resource => {
            const value = simplex.noise3d(
                (this.position.x + x) / resource.scale.x,
                (this.position.y + y) / resource.scale.y,
                (this.position.z + z) / resource.scale.z
            );
            if (value > resource.scarcity) this.setBlockId(x, y, z, resource.id);
        });
    }

    generateTree(rng, biome, x, y, z) {
        const h = Math.round(this.params.trees.trunk.minHeight + 
            (this.params.trees.trunk.maxHeight - this.params.trees.trunk.minHeight) * rng.random());
        for (let treeY = y; treeY <= y + h; treeY++) {
            if (biome === 'Temperate' || biome === 'Tundra') this.setBlockId(x, treeY, z, blocks.tree.id);
            else if (biome === 'Jungle') this.setBlockId(x, treeY, z, blocks.jungleTree.id);
            else if (biome === 'Desert') this.setBlockId(x, treeY, z, blocks.cactus.id);
        }
        if (biome === 'Temperate' || biome === 'Jungle') this.generateTreeCanopy(biome, x, y + h, z, rng);
    }

    generateTreeCanopy(biome, cx, cy, cz, rng) {
        const r = Math.round(this.params.trees.canopy.minRadius + 
            (this.params.trees.canopy.maxRadius - this.params.trees.canopy.minRadius) * rng.random());
        for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
            if (x*x + y*y + z*z > r*r) continue;
            const block = this.getBlock(cx + x, cy + y, cz + z);
            if (block && block.id !== blocks.empty.id) continue;
            if (rng.random() < this.params.trees.canopy.density) {
                if (biome === 'Temperate') this.setBlockId(cx + x, cy + y, cz + z, blocks.leaves.id);
                else if (biome === 'Jungle') this.setBlockId(cx + x, cy + y, cz + z, blocks.jungleLeaves.id);
            }
        }
    }

    generateClouds(rng) {
        const simplex = new SimplexNoise(rng);
        for (let x = 0; x < this.size.width; x++) for (let z = 0; z < this.size.width; z++) {
            const value = (simplex.noise(
                (this.position.x + x) / this.params.clouds.scale,
                (this.position.z + z) / this.params.clouds.scale
            ) + 1) * 0.5;
            if (value < this.params.clouds.density) this.setBlockId(x, this.size.height - 1, z, blocks.cloud.id);
        }
    }

    loadPlayerChanges() {
        for (let x = 0; x < this.size.width; x++) for (let y = 0; y < this.size.height; y++) for (let z = 0; z < this.size.width; z++) {
            if (this.dataStore.contains(this.position.x, this.position.z, x, y, z)) {
                const blockId = this.dataStore.get(this.position.x, this.position.z, x, y, z);
                this.setBlockId(x, y, z, blockId);
            }
        }
    }

    generateWater() {
        const material = new THREE.MeshLambertMaterial({ color: 0x9090e0, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
        waterMesh.rotateX(-Math.PI / 2);
        waterMesh.position.set(this.size.width / 2, this.params.terrain.waterOffset + 0.4, this.size.width / 2);
        waterMesh.scale.set(this.size.width, this.size.width, 1);
        waterMesh.layers.set(1);
        this.add(waterMesh);
    }

    generateMeshes() {
        this.clear();
        this.generateWater();
        const maxCount = this.size.width * this.size.width * this.size.height;
        const meshes = {};
        Object.values(blocks).filter(b => b.id !== blocks.empty.id).forEach(b => {
            const mesh = new THREE.InstancedMesh(geometry, b.material, maxCount);
            mesh.name = b.id;
            mesh.count = 0;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            meshes[b.id] = mesh;
        });
        const matrix = new THREE.Matrix4();
        for (let x = 0; x < this.size.width; x++) for (let y = 0; y < this.size.height; y++) for (let z = 0; z < this.size.width; z++) {
            const blockId = this.getBlock(x, y, z).id;
            if (blockId === blocks.empty.id) continue;
            const mesh = meshes[blockId];
            const instanceId = mesh.count;
            if (!this.isBlockObscured(x, y, z)) {
                matrix.setPosition(x, y, z);
                mesh.setMatrixAt(instanceId, matrix);
                this.setBlockInstanceId(x, y, z, instanceId);
                mesh.count++;
            }
        }
        this.add(...Object.values(meshes));
    }

    getBlock(x, y, z) {
        if (this.inBounds(x, y, z)) return this.data[x][y][z];
        return null;
    }

    addBlock(x, y, z, blockId) {
        if (this.getBlock(x, y, z).id === blocks.empty.id) {
            this.setBlockId(x, y, z, blockId);
            this.addBlockInstance(x, y, z);
            this.dataStore.set(this.position.x, this.position.z, x, y, z, blockId);
        }
    }

    removeBlock(x, y, z) {
        const block = this.getBlock(x, y, z);
        if (block && block.id !== blocks.empty.id) {
            this.deleteBlockInstance(x, y, z);
            this.setBlockId(x, y, z, blocks.empty.id);
            this.dataStore.set(this.position.x, this.position.z, x, y, z, blocks.empty.id);
        }
    }

    deleteBlockInstance(x, y, z) {
        const block = this.getBlock(x, y, z);
        if (block.instanceId === null) return;
        const mesh = this.children.find(m => m.name === block.id);
        const instanceId = block.instanceId;
        const lastMatrix = new THREE.Matrix4();
        mesh.getMatrixAt(mesh.count - 1, lastMatrix);
        const v = new THREE.Vector3();
        v.applyMatrix4(lastMatrix);
        this.setBlockInstanceId(v.x, v.y, v.z, instanceId);
        mesh.setMatrixAt(instanceId, lastMatrix);
        mesh.count--;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.setBlockInstanceId(x, y, z, null);
    }

    addBlockInstance(x, y, z) {
        const block = this.getBlock(x, y, z);
        if (block && block.id !== blocks.empty.id) {
            const mesh = this.children.find(m => m.name === block.id);
            const instanceId = mesh.count++;
            this.setBlockInstanceId(x, y, z, instanceId);
            const matrix = new THREE.Matrix4();
            matrix.setPosition(x, y, z);
            mesh.setMatrixAt(instanceId, matrix);
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    setBlockId(x, y, z, id) {
        if (this.inBounds(x, y, z)) this.data[x][y][z].id = id;
    }

    setBlockInstanceId(x, y, z, instanceId) {
        if (this.inBounds(x, y, z)) this.data[x][y][z].instanceId = instanceId;
    }

    inBounds(x, y, z) {
        return x >= 0 && x < this.size.width && y >= 0 && y < this.size.height && z >= 0 && z < this.size.width;
    }

    isBlockObscured(x, y, z) {
        const up = this.getBlock(x, y + 1, z)?.id ?? blocks.empty.id;
        const down = this.getBlock(x, y - 1, z)?.id ?? blocks.empty.id;
        const left = this.getBlock(x + 1, y, z)?.id ?? blocks.empty.id;
        const right = this.getBlock(x - 1, y, z)?.id ?? blocks.empty.id;
        const forward = this.getBlock(x, y, z + 1)?.id ?? blocks.empty.id;
        const back = this.getBlock(x, y, z - 1)?.id ?? blocks.empty.id;
        return up !== blocks.empty.id && down !== blocks.empty.id && left !== blocks.empty.id &&
               right !== blocks.empty.id && forward !== blocks.empty.id && back !== blocks.empty.id;
    }

    disposeInstances() {
        this.traverse(obj => { if (obj.dispose) obj.dispose(); });
        this.clear();
    }
}
