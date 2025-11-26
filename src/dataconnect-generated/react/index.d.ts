import { CreateResearcherData, CreateResearcherVariables, GetExperimentsByResearcherData, GetExperimentsByResearcherVariables, CreateParticipantData, CreateParticipantVariables, GetDataPointsForParticipantData, GetDataPointsForParticipantVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateResearcher(options?: useDataConnectMutationOptions<CreateResearcherData, FirebaseError, CreateResearcherVariables>): UseDataConnectMutationResult<CreateResearcherData, CreateResearcherVariables>;
export function useCreateResearcher(dc: DataConnect, options?: useDataConnectMutationOptions<CreateResearcherData, FirebaseError, CreateResearcherVariables>): UseDataConnectMutationResult<CreateResearcherData, CreateResearcherVariables>;

export function useGetExperimentsByResearcher(vars: GetExperimentsByResearcherVariables, options?: useDataConnectQueryOptions<GetExperimentsByResearcherData>): UseDataConnectQueryResult<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;
export function useGetExperimentsByResearcher(dc: DataConnect, vars: GetExperimentsByResearcherVariables, options?: useDataConnectQueryOptions<GetExperimentsByResearcherData>): UseDataConnectQueryResult<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;

export function useCreateParticipant(options?: useDataConnectMutationOptions<CreateParticipantData, FirebaseError, CreateParticipantVariables>): UseDataConnectMutationResult<CreateParticipantData, CreateParticipantVariables>;
export function useCreateParticipant(dc: DataConnect, options?: useDataConnectMutationOptions<CreateParticipantData, FirebaseError, CreateParticipantVariables>): UseDataConnectMutationResult<CreateParticipantData, CreateParticipantVariables>;

export function useGetDataPointsForParticipant(vars: GetDataPointsForParticipantVariables, options?: useDataConnectQueryOptions<GetDataPointsForParticipantData>): UseDataConnectQueryResult<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
export function useGetDataPointsForParticipant(dc: DataConnect, vars: GetDataPointsForParticipantVariables, options?: useDataConnectQueryOptions<GetDataPointsForParticipantData>): UseDataConnectQueryResult<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
