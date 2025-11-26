const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'user',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const createResearcherRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateResearcher', inputVars);
}
createResearcherRef.operationName = 'CreateResearcher';
exports.createResearcherRef = createResearcherRef;

exports.createResearcher = function createResearcher(dcOrVars, vars) {
  return executeMutation(createResearcherRef(dcOrVars, vars));
};

const getExperimentsByResearcherRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetExperimentsByResearcher', inputVars);
}
getExperimentsByResearcherRef.operationName = 'GetExperimentsByResearcher';
exports.getExperimentsByResearcherRef = getExperimentsByResearcherRef;

exports.getExperimentsByResearcher = function getExperimentsByResearcher(dcOrVars, vars) {
  return executeQuery(getExperimentsByResearcherRef(dcOrVars, vars));
};

const createParticipantRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateParticipant', inputVars);
}
createParticipantRef.operationName = 'CreateParticipant';
exports.createParticipantRef = createParticipantRef;

exports.createParticipant = function createParticipant(dcOrVars, vars) {
  return executeMutation(createParticipantRef(dcOrVars, vars));
};

const getDataPointsForParticipantRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetDataPointsForParticipant', inputVars);
}
getDataPointsForParticipantRef.operationName = 'GetDataPointsForParticipant';
exports.getDataPointsForParticipantRef = getDataPointsForParticipantRef;

exports.getDataPointsForParticipant = function getDataPointsForParticipant(dcOrVars, vars) {
  return executeQuery(getDataPointsForParticipantRef(dcOrVars, vars));
};
