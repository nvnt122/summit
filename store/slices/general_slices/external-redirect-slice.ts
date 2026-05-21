import { createSlice } from '@reduxjs/toolkit';

interface ExternalRedirectState {
  lead_id: string | null;
  cmcd: string | null;
  user_id: string | null;
  originalUrl: string | null;
  query: any | null;
  from_crm: boolean;
}

const initialState: ExternalRedirectState = {
  lead_id: null,
  cmcd: null,
  user_id: null,
  originalUrl: null,
  query: null,
  from_crm: false,
};

export const externalRedirectSlice = createSlice({
  name: 'externalRedirect',
  initialState,
  reducers: {
    setExternalData: (state, action) => {
      const { lead_id, cmcd, user_id, originalUrl, query, from_crm } = action.payload;
      state.lead_id = lead_id || null;
      state.cmcd = cmcd || null;
      state.user_id = user_id || null;
      state.originalUrl = originalUrl || null;
      state.query = query || null;
      state.from_crm = from_crm || false;
    },
    clearExternalData: (state) => {
      state.lead_id = null;
      state.cmcd = null;
      state.user_id = null;
      state.originalUrl = null;
      state.query = null;
      state.from_crm = false;
    },
  },
});

export const { setExternalData, clearExternalData } = externalRedirectSlice.actions;
export const ExternalRedirectFromStore = (state: any) => state.externalRedirect;
export default externalRedirectSlice.reducer;
