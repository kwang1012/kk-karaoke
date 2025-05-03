import { createSlice } from '@reduxjs/toolkit';

type LocalState = {
  likes: {
    [key: string]: boolean;
  };
};

const initialState: LocalState = { likes: {} };

export const localSlice = createSlice({
  name: 'local',
  initialState,
  reducers: {
    thumb: (state, { payload }) => {
      const commentId = payload;
      if (!state.likes[commentId]) {
        state.likes[commentId] = true;
      } else {
        state.likes[commentId] = false;
      }
    },
  },
});

export const { thumb } = localSlice.actions;

export default localSlice.reducer;
