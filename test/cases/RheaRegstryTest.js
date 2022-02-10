import {
  getChaiBN,
  BigNumber,
} from '@nomisma/nomisma-smart-contract-helpers';
import { deployRegistry } from '../helpers/registry';
import { deployRheaGeToken } from '../helpers/rgt';
import { roleNames } from '../helpers/roles';

require('chai')
  .use(require('chai-as-promised'))
  .use(getChaiBN())
  .should();


const RoleManager = artifacts.require('./RoleManager.sol');

const {
  MINTER_ROLE,
  BURNER_ROLE,
  CERTIFIER_ROLE,
} = roleNames;

contract('RheaGeRegistry Test', ([
  governor,
  certifier,
  offsetter1,
  rheaGeTokenMock,
  rgtReceiver,
]) => {
  const projectId = new BigNumber('1748');
  const batchDataBase = {
    serialNumber: '1234567-D81FA-3772',
    projectId,
    vintageEnd: '01-12-2019',
    creditType: 'VCU',
    quantity: new BigNumber(10000),
    certifications: '01: No Poverty; 02: Zero Hunger; 03: Good Health and Well-being;',
  };

  const projectDataBase = {
    projectId,
    name: 'Southern Cardamom REDD+ Project',
    projectType: 'Agriculture Forestry and Other Land Use',
  };

  before(async function () {
    this.roleManager = await RoleManager.new([ governor ], '1');
    this.rheaGe = await deployRheaGeToken(this.roleManager.address, governor);

    this.registry = await deployRegistry(
      this.rheaGe.address,
      this.roleManager.address,
      governor
    );

    await this.roleManager.addRolesForAddresses(
      [
        certifier,
        this.registry.address,
        this.registry.address,
      ],
      [
        CERTIFIER_ROLE,
        MINTER_ROLE,
        BURNER_ROLE,
      ],
      { from: governor }
    );

    await this.registry.generateBatch(
      ...Object.values(batchDataBase),
      rgtReceiver,
      { from: certifier }
    );
  });

  describe('#generateBatch()', () => {
    it('should generate new batch and mint the correct amount of tokens to the rgtReceiver', async function () {
      const newBatch = {
        ...batchDataBase,
        serialNumber: '131553135',
      };
      const receiverBalBefore = await this.rheaGe.balanceOf(rgtReceiver);

      await this.registry.generateBatch(
        ...Object.values(newBatch),
        rgtReceiver,
        { from: certifier }
      ).should.be.fulfilled;

      const {
        serialNumber: serialNumberSC,
        projectId: projectIdSC,
        vintageEnd: vintageEndSC,
        creditType: cresitTypeSC,
        quantity: quantitySC,
        initialRgtOwner: initialRgtOwnerSC,
        created,
      } = await this.registry.registeredBatches(newBatch.serialNumber);

      serialNumberSC.should.be.equal(newBatch.serialNumber);
      projectIdSC.should.be.bignumber.equal(newBatch.projectId);
      vintageEndSC.should.be.equal(newBatch.vintageEnd);
      cresitTypeSC.should.be.equal(newBatch.creditType);
      quantitySC.should.be.bignumber.equal(newBatch.quantity);
      initialRgtOwnerSC.should.be.equal(rgtReceiver);
      created.should.be.equal(true);

      const receiverBalAfter = await this.rheaGe.balanceOf(rgtReceiver);
      receiverBalAfter.sub(receiverBalBefore).should.be.bignumber.equal(newBatch.quantity);
      receiverBalAfter.sub(receiverBalBefore).should.be.bignumber.equal(quantitySC);
    });

    it('should should NOT generate the same batch twice', async function () {
      const newBatch = {
        ...batchDataBase,
        serialNumber: '3333333',
      };

      await this.registry.generateBatch(
        ...Object.values(newBatch),
        rgtReceiver,
        { from: certifier }
      ).should.be.fulfilled;

      await this.registry.generateBatch(
        ...Object.values(newBatch),
        rgtReceiver,
        { from: certifier }
      ).should.be.rejectedWith('RGRegistry::generateBatch: Batch already created');
    });
  });

  describe('#retire()', async () => {
    // eslint-disable-next-line max-len
    it('should retire, burn the correct amount of tokens and change clients balance appropriately when called by any client', async function () {
      const newBatch = {
        ...batchDataBase,
        serialNumber: '3331233',
      };
      const tokenAmtBought = new BigNumber(350);
      const tokenAmtRetire1 = new BigNumber(7);
      const tokenAmtRetire2 = new BigNumber(179);

      await this.registry.generateBatch(
        ...Object.values(newBatch),
        rgtReceiver,
        { from: certifier }
      ).should.be.fulfilled;

      await this.rheaGe.transfer(offsetter1, tokenAmtBought, { from: rgtReceiver });

      const offsetterBalanceBefore = await this.rheaGe.balanceOf(offsetter1);

      await this.registry.retire(tokenAmtRetire1, { from: offsetter1 }).should.be.fulfilled;

      // for checking proper storage updates
      await this.registry.retire(tokenAmtRetire2, { from: rgtReceiver }).should.be.fulfilled;

      const offsetterBalanceAfter = await this.rheaGe.balanceOf(offsetter1);

      offsetterBalanceBefore.sub(offsetterBalanceAfter).should.be.bignumber.equal(tokenAmtRetire1);
      offsetterBalanceAfter.should.be.bignumber.equal(tokenAmtBought.sub(tokenAmtRetire1));

      const retiredBalanceClient1 = await this.registry.retiredBalances(offsetter1);
      const retiredBalanceClient2 = await this.registry.retiredBalances(rgtReceiver);
      const totalSupplyRetired = await this.registry.totalSupplyRetired();

      retiredBalanceClient1.should.be.bignumber.equal(tokenAmtRetire1);
      retiredBalanceClient2.should.be.bignumber.equal(tokenAmtRetire2);
      totalSupplyRetired.should.be.bignumber.equal(tokenAmtRetire1.add(tokenAmtRetire2));
    });

    // TODO: add more tests here !!! (i.e. does it add up to retiredBalanced if a client offsets multiple times?)
    // TODO: also test `addProject()`
  });

  it('#addProject() should write project to storage', async function () {
    await this.registry.addProject(
      ...Object.values(projectDataBase),
      { from: certifier }
    ).should.be.fulfilled;

    const {
      name,
      projectType,
      created,
    } = await this.registry.registeredProjects(projectDataBase.projectId);

    name.should.be.equal(projectDataBase.name);
    projectType.should.be.equal(projectDataBase.projectType);
    created.should.be.equal(true);
  });

  // TODO: test access to each function

  // TODO: describe('Events', () => {}); test all events on Registry

  it('should set new rheaGeToken address', async function () {
    const previousTokenAddress = await this.registry.rheaGeToken();
    previousTokenAddress.should.be.equal(this.rheaGe.address);

    await this.registry.setRheaGeToken(rheaGeTokenMock, { from: governor });
    const tokenAddressAfter = await this.registry.rheaGeToken();
    tokenAddressAfter.should.be.equal(rheaGeTokenMock);

    // set it back so other tests work
    await this.registry.setRheaGeToken(this.rheaGe.address, { from: governor });
    const tokenAddressReSet = await this.registry.rheaGeToken();
    tokenAddressReSet.should.be.equal(this.rheaGe.address);
  });

  it('should NOT initialize twice', async function () {
    await this.registry.init(this.rheaGe.address, this.roleManager.address)
      .should.be.rejectedWith('Initializable: contract is already initialized');
  });
});
