# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetExperimentsByResearcher*](#getexperimentsbyresearcher)
  - [*GetDataPointsForParticipant*](#getdatapointsforparticipant)
- [**Mutations**](#mutations)
  - [*CreateResearcher*](#createresearcher)
  - [*CreateParticipant*](#createparticipant)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetExperimentsByResearcher
You can execute the `GetExperimentsByResearcher` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getExperimentsByResearcher(vars: GetExperimentsByResearcherVariables): QueryPromise<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;

interface GetExperimentsByResearcherRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetExperimentsByResearcherVariables): QueryRef<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;
}
export const getExperimentsByResearcherRef: GetExperimentsByResearcherRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getExperimentsByResearcher(dc: DataConnect, vars: GetExperimentsByResearcherVariables): QueryPromise<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;

interface GetExperimentsByResearcherRef {
  ...
  (dc: DataConnect, vars: GetExperimentsByResearcherVariables): QueryRef<GetExperimentsByResearcherData, GetExperimentsByResearcherVariables>;
}
export const getExperimentsByResearcherRef: GetExperimentsByResearcherRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getExperimentsByResearcherRef:
```typescript
const name = getExperimentsByResearcherRef.operationName;
console.log(name);
```

### Variables
The `GetExperimentsByResearcher` query requires an argument of type `GetExperimentsByResearcherVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetExperimentsByResearcherVariables {
  researcherId: UUIDString;
}
```
### Return Type
Recall that executing the `GetExperimentsByResearcher` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetExperimentsByResearcherData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetExperimentsByResearcher`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getExperimentsByResearcher, GetExperimentsByResearcherVariables } from '@dataconnect/generated';

// The `GetExperimentsByResearcher` query requires an argument of type `GetExperimentsByResearcherVariables`:
const getExperimentsByResearcherVars: GetExperimentsByResearcherVariables = {
  researcherId: ..., 
};

// Call the `getExperimentsByResearcher()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getExperimentsByResearcher(getExperimentsByResearcherVars);
// Variables can be defined inline as well.
const { data } = await getExperimentsByResearcher({ researcherId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getExperimentsByResearcher(dataConnect, getExperimentsByResearcherVars);

console.log(data.experiments);

// Or, you can use the `Promise` API.
getExperimentsByResearcher(getExperimentsByResearcherVars).then((response) => {
  const data = response.data;
  console.log(data.experiments);
});
```

### Using `GetExperimentsByResearcher`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getExperimentsByResearcherRef, GetExperimentsByResearcherVariables } from '@dataconnect/generated';

// The `GetExperimentsByResearcher` query requires an argument of type `GetExperimentsByResearcherVariables`:
const getExperimentsByResearcherVars: GetExperimentsByResearcherVariables = {
  researcherId: ..., 
};

// Call the `getExperimentsByResearcherRef()` function to get a reference to the query.
const ref = getExperimentsByResearcherRef(getExperimentsByResearcherVars);
// Variables can be defined inline as well.
const ref = getExperimentsByResearcherRef({ researcherId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getExperimentsByResearcherRef(dataConnect, getExperimentsByResearcherVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.experiments);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.experiments);
});
```

## GetDataPointsForParticipant
You can execute the `GetDataPointsForParticipant` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getDataPointsForParticipant(vars: GetDataPointsForParticipantVariables): QueryPromise<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;

interface GetDataPointsForParticipantRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetDataPointsForParticipantVariables): QueryRef<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
}
export const getDataPointsForParticipantRef: GetDataPointsForParticipantRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getDataPointsForParticipant(dc: DataConnect, vars: GetDataPointsForParticipantVariables): QueryPromise<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;

interface GetDataPointsForParticipantRef {
  ...
  (dc: DataConnect, vars: GetDataPointsForParticipantVariables): QueryRef<GetDataPointsForParticipantData, GetDataPointsForParticipantVariables>;
}
export const getDataPointsForParticipantRef: GetDataPointsForParticipantRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getDataPointsForParticipantRef:
```typescript
const name = getDataPointsForParticipantRef.operationName;
console.log(name);
```

### Variables
The `GetDataPointsForParticipant` query requires an argument of type `GetDataPointsForParticipantVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetDataPointsForParticipantVariables {
  participantId: UUIDString;
}
```
### Return Type
Recall that executing the `GetDataPointsForParticipant` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetDataPointsForParticipantData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetDataPointsForParticipant`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getDataPointsForParticipant, GetDataPointsForParticipantVariables } from '@dataconnect/generated';

// The `GetDataPointsForParticipant` query requires an argument of type `GetDataPointsForParticipantVariables`:
const getDataPointsForParticipantVars: GetDataPointsForParticipantVariables = {
  participantId: ..., 
};

// Call the `getDataPointsForParticipant()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getDataPointsForParticipant(getDataPointsForParticipantVars);
// Variables can be defined inline as well.
const { data } = await getDataPointsForParticipant({ participantId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getDataPointsForParticipant(dataConnect, getDataPointsForParticipantVars);

console.log(data.dataPoints);

// Or, you can use the `Promise` API.
getDataPointsForParticipant(getDataPointsForParticipantVars).then((response) => {
  const data = response.data;
  console.log(data.dataPoints);
});
```

### Using `GetDataPointsForParticipant`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getDataPointsForParticipantRef, GetDataPointsForParticipantVariables } from '@dataconnect/generated';

// The `GetDataPointsForParticipant` query requires an argument of type `GetDataPointsForParticipantVariables`:
const getDataPointsForParticipantVars: GetDataPointsForParticipantVariables = {
  participantId: ..., 
};

// Call the `getDataPointsForParticipantRef()` function to get a reference to the query.
const ref = getDataPointsForParticipantRef(getDataPointsForParticipantVars);
// Variables can be defined inline as well.
const ref = getDataPointsForParticipantRef({ participantId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getDataPointsForParticipantRef(dataConnect, getDataPointsForParticipantVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.dataPoints);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.dataPoints);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateResearcher
You can execute the `CreateResearcher` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createResearcher(vars: CreateResearcherVariables): MutationPromise<CreateResearcherData, CreateResearcherVariables>;

interface CreateResearcherRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateResearcherVariables): MutationRef<CreateResearcherData, CreateResearcherVariables>;
}
export const createResearcherRef: CreateResearcherRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createResearcher(dc: DataConnect, vars: CreateResearcherVariables): MutationPromise<CreateResearcherData, CreateResearcherVariables>;

interface CreateResearcherRef {
  ...
  (dc: DataConnect, vars: CreateResearcherVariables): MutationRef<CreateResearcherData, CreateResearcherVariables>;
}
export const createResearcherRef: CreateResearcherRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createResearcherRef:
```typescript
const name = createResearcherRef.operationName;
console.log(name);
```

### Variables
The `CreateResearcher` mutation requires an argument of type `CreateResearcherVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateResearcherVariables {
  firstName: string;
  lastName: string;
  email: string;
  affiliation?: string | null;
  photoUrl?: string | null;
}
```
### Return Type
Recall that executing the `CreateResearcher` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateResearcherData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateResearcherData {
  researcher_insert: Researcher_Key;
}
```
### Using `CreateResearcher`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createResearcher, CreateResearcherVariables } from '@dataconnect/generated';

// The `CreateResearcher` mutation requires an argument of type `CreateResearcherVariables`:
const createResearcherVars: CreateResearcherVariables = {
  firstName: ..., 
  lastName: ..., 
  email: ..., 
  affiliation: ..., // optional
  photoUrl: ..., // optional
};

// Call the `createResearcher()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createResearcher(createResearcherVars);
// Variables can be defined inline as well.
const { data } = await createResearcher({ firstName: ..., lastName: ..., email: ..., affiliation: ..., photoUrl: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createResearcher(dataConnect, createResearcherVars);

console.log(data.researcher_insert);

// Or, you can use the `Promise` API.
createResearcher(createResearcherVars).then((response) => {
  const data = response.data;
  console.log(data.researcher_insert);
});
```

### Using `CreateResearcher`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createResearcherRef, CreateResearcherVariables } from '@dataconnect/generated';

// The `CreateResearcher` mutation requires an argument of type `CreateResearcherVariables`:
const createResearcherVars: CreateResearcherVariables = {
  firstName: ..., 
  lastName: ..., 
  email: ..., 
  affiliation: ..., // optional
  photoUrl: ..., // optional
};

// Call the `createResearcherRef()` function to get a reference to the mutation.
const ref = createResearcherRef(createResearcherVars);
// Variables can be defined inline as well.
const ref = createResearcherRef({ firstName: ..., lastName: ..., email: ..., affiliation: ..., photoUrl: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createResearcherRef(dataConnect, createResearcherVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.researcher_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.researcher_insert);
});
```

## CreateParticipant
You can execute the `CreateParticipant` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createParticipant(vars: CreateParticipantVariables): MutationPromise<CreateParticipantData, CreateParticipantVariables>;

interface CreateParticipantRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateParticipantVariables): MutationRef<CreateParticipantData, CreateParticipantVariables>;
}
export const createParticipantRef: CreateParticipantRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createParticipant(dc: DataConnect, vars: CreateParticipantVariables): MutationPromise<CreateParticipantData, CreateParticipantVariables>;

interface CreateParticipantRef {
  ...
  (dc: DataConnect, vars: CreateParticipantVariables): MutationRef<CreateParticipantData, CreateParticipantVariables>;
}
export const createParticipantRef: CreateParticipantRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createParticipantRef:
```typescript
const name = createParticipantRef.operationName;
console.log(name);
```

### Variables
The `CreateParticipant` mutation requires an argument of type `CreateParticipantVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateParticipantVariables {
  experimentId: UUIDString;
  participantId: string;
  age?: number | null;
  gender?: string | null;
  demographicDetails?: string | null;
}
```
### Return Type
Recall that executing the `CreateParticipant` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateParticipantData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateParticipantData {
  participant_insert: Participant_Key;
}
```
### Using `CreateParticipant`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createParticipant, CreateParticipantVariables } from '@dataconnect/generated';

// The `CreateParticipant` mutation requires an argument of type `CreateParticipantVariables`:
const createParticipantVars: CreateParticipantVariables = {
  experimentId: ..., 
  participantId: ..., 
  age: ..., // optional
  gender: ..., // optional
  demographicDetails: ..., // optional
};

// Call the `createParticipant()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createParticipant(createParticipantVars);
// Variables can be defined inline as well.
const { data } = await createParticipant({ experimentId: ..., participantId: ..., age: ..., gender: ..., demographicDetails: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createParticipant(dataConnect, createParticipantVars);

console.log(data.participant_insert);

// Or, you can use the `Promise` API.
createParticipant(createParticipantVars).then((response) => {
  const data = response.data;
  console.log(data.participant_insert);
});
```

### Using `CreateParticipant`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createParticipantRef, CreateParticipantVariables } from '@dataconnect/generated';

// The `CreateParticipant` mutation requires an argument of type `CreateParticipantVariables`:
const createParticipantVars: CreateParticipantVariables = {
  experimentId: ..., 
  participantId: ..., 
  age: ..., // optional
  gender: ..., // optional
  demographicDetails: ..., // optional
};

// Call the `createParticipantRef()` function to get a reference to the mutation.
const ref = createParticipantRef(createParticipantVars);
// Variables can be defined inline as well.
const ref = createParticipantRef({ experimentId: ..., participantId: ..., age: ..., gender: ..., demographicDetails: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createParticipantRef(dataConnect, createParticipantVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.participant_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.participant_insert);
});
```

