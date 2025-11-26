import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateParticipantData {
  participant_insert: Participant_Key;
}

export interface CreateParticipantVariables {
  experimentId: UUIDString;
  participantId: string;
  age?: number | null;
  gender?: string | null;
  demographicDetails?: string | null;
}

export interface CreateResearcherData {
  researcher_insert: Researcher_Key;
}

export interface CreateResearcherVariables {
  firstName: string;
  lastName: string;
  email: string;
  affiliation?: string | null;
  photoUrl?: string | null;
}

export interface DataPoint_Key {
  id: UUIDString;
  __typename?: 'DataPoint_Key';
}

export interface Experiment_Key {
  id: UUIDString;
  __typename?: 'Experiment_Key';
}

export interface GetDataPointsForParticipantData {
  dataPoints: ({
    id: UUIDString;
    variableName?: string | null;
    value: string;
    timestamp: TimestampString;
    phase?: string | null;
    notes?: string | null;
  } & DataPoint_Key)[];
}

export interface GetDataPointsForParticipantVariables {
  participantId: UUIDString;
}

export interface GetExperimentsByResearcherData {
  experiments: ({
    id: UUIDString;
    name: string;
    description: string;
    startDate?: DateString | null;
    endDate?: DateString | null;
    status: string;
  } & Experiment_Key)[];
}

export interface GetExperimentsByResearcherVariables {
  researcherId: UUIDString;
}

export interface Participant_Key {
  id: UUIDString;
  __typename?: 'Participant_Key';
}

export interface Researcher_Key {
  id: UUIDString;
  __typename?: 'Researcher_Key';
}

export interface Variable_Key {
  id: UUIDString;
  __typename?: 'Variable_Key';
}

interface CreateResearcherRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateResearcherVariables): MutationRef<CreateResearcherData, CreateResearcherVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateResearcherVariables): MutationRef<CreateResearcherData, CreateResearcherVariables>;
  operationName: string;
}
export const createResearcherRef: CreateResearcherRef;

export function createResearcher(vars: CreateResearcherVariables): MutationPromise<CreateResearcherData, CreateResearcherVariables>;
export function createResearcher(dc: DataConnect, vars: CreateResearcherVariables): MutationPromise<CreateResearcherData, CreateResearcherVariables>;

interface GetExperimentsByResearcherRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetExperimentsByResearcherVariables): QueryRef<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetExperimentsByResearcherVariables): QueryRef<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;
  operationName: string;
}
export const getExperimentsByResearcherRef: GetExperimentsByResearcherRef;

export function getExperimentsByResearcher(vars: GetExperimentsByResearcherVariables): QueryPromise<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;
export function getExperimentsByResearcher(dc: DataConnect, vars: GetExperimentsByResearcherVariables): QueryPromise<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;

interface CreateParticipantRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateParticipantVariables): MutationRef<CreateParticipantData, CreateParticipantVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateParticipantVariables): MutationRef<CreateParticipantData, CreateParticipantVariables>;
  operationName: string;
}
export const createParticipantRef: CreateParticipantRef;

export function createParticipant(vars: CreateParticipantVariables): MutationPromise<CreateParticipantData, CreateParticipantVariables>;
export function createParticipant(dc: DataConnect, vars: CreateParticipantVariables): MutationPromise<CreateParticipantData, CreateParticipantVariables>;

interface GetDataPointsForParticipantRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetDataPointsForParticipantVariables): QueryRef<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetDataPointsForParticipantVariables): QueryRef<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
  operationName: string;
}
export const getDataPointsForParticipantRef: GetDataPointsForParticipantRef;

export function getDataPointsForParticipant(vars: GetDataPointsForParticipantVariables): QueryPromise<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
export function getDataPointsForParticipant(dc: DataConnect, vars: GetDataPointsForParticipantVariables): QueryPromise<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;

