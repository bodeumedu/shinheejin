# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useCreateResearcher, useGetExperimentsByResearcher, useCreateParticipant, useGetDataPointsForParticipant } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useCreateResearcher(createResearcherVars);

const { data, isPending, isSuccess, isError, error } = useGetExperimentsByResearcher(getExperimentsByResearcherVars);

const { data, isPending, isSuccess, isError, error } = useCreateParticipant(createParticipantVars);

const { data, isPending, isSuccess, isError, error } = useGetDataPointsForParticipant(getDataPointsForParticipantVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createResearcher, getExperimentsByResearcher, createParticipant, getDataPointsForParticipant } from '@dataconnect/generated';


// Operation CreateResearcher:  For variables, look at type CreateResearcherVars in ../index.d.ts
const { data } = await CreateResearcher(dataConnect, createResearcherVars);

// Operation GetExperimentsByResearcher:  For variables, look at type GetExperimentsByResearcherVars in ../index.d.ts
const { data } = await GetExperimentsByResearcher(dataConnect, getExperimentsByResearcherVars);

// Operation CreateParticipant:  For variables, look at type CreateParticipantVars in ../index.d.ts
const { data } = await CreateParticipant(dataConnect, createParticipantVars);

// Operation GetDataPointsForParticipant:  For variables, look at type GetDataPointsForParticipantVars in ../index.d.ts
const { data } = await GetDataPointsForParticipant(dataConnect, getDataPointsForParticipantVars);


```