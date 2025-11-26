import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'user',
  location: 'us-east4'
};

export const createResearcherRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateResearcher', inputVars);
}
createResearcherRef.operationName = 'CreateResearcher';

export function createResearcher(dcOrVars, vars) {
  return executeMutation(createResearcherRef(dcOrVars, vars));
}

export const getExperimentsByResearcherRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetExperimentsByResearcher', inputVars);
}
getExperimentsByResearcherRef.operationName = 'GetExperimentsByResearcher';

export function getExperimentsByResearcher(dcOrVars, vars) {
  return executeQuery(getExperimentsByResearcherRef(dcOrVars, vars));
}

export const createParticipantRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateParticipant', inputVars);
}
createParticipantRef.operationName = 'CreateParticipant';

export function createParticipant(dcOrVars, vars) {
  return executeMutation(createParticipantRef(dcOrVars, vars));
}

export const getDataPointsForParticipantRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetDataPointsForParticipant', inputVars);
}
getDataPointsForParticipantRef.operationName = 'GetDataPointsForParticipant';

export function getDataPointsForParticipant(dcOrVars, vars) {
  return executeQuery(getDataPointsForParticipantRef(dcOrVars, vars));
}

