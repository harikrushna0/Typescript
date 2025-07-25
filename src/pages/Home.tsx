import React, { useEffect, useState } from "react";
import Analysis from "../components/analysis/Analysis";
import {
  useGetHistoryQuery,
  useLazyGetHistoryByIdQuery,
} from "../api/historyApiSlice";
import {
  useGetOrderDetailsMutation,
  useGetOrderStatusMutation,
} from "../api/orderApi";
import { selectUser } from "../shared/slices/userSlice";
import { useSelector } from "react-redux";
import { HistoryState } from "../shared/types/home";
import History from "../components/history/History";
import { useCallRestApiOpenAi3_5Mutation } from "../api/analysisApi";
import { setWebSocket } from "../api/Socket";
import Pulse from "../components/loader/Pulse";
import "../components/history/History.css";
import Factors from "../components/dropdown/Factors";
import { callOpenAi3_5WithLogging } from "../shared/services/analysisService";
import {
  fetchOrderDetailsWithLogging,
  fetchOrderStatusWithLogging,
} from "../shared/services/orderService";
import {
  fetchHistoryByIdWithLogging,
  logFetchHistoryByUserId,
} from "../shared/services/historyService";
import { postMessage } from "./../shared/vscode/vscode-api";
import { transformText } from "../shared/data/Description";

// type Analysis = {
//   response: any;
//   analysisId: number;
//   fileName: string;
//   factor: string;
//   feedback: string;
//   running: boolean;
//   language:any;
//   error: any;
// };

// type oldAnalysis = {
//   loading: boolean;
//   error: any;
//   analysis: {
//     response: any;
//     analysisId: number;
//     fileName: string;
//     factor: string;
//     feedback: string;
//     running: boolean;
//     error: any;
//   };
// };

const Home: React.FC = () => {
  const { userId } = useSelector(selectUser);
  const [isMarkdown, setIsMarkdown] = useState(false);

  const [oldAnalysis, setOldAnalysis] = useState<oldAnalysis>({
    loading: false,
    error: null,
    analysis: {
      response: null,
      analysisId: -1,
      fileName: "",
      factor: "",
      feedback: "Not Responded",
      running: false,
      error: false,
    },
  });

  const [planDetails, setPlanDetails] = useState({
    plan_auth: false,
    order_id: "",
    plan_status: "",
    plan_type: "",
  });

  // Define the mutations for fetching order details and order status
  const [getOrderDetails] = useGetOrderDetailsMutation();
  const [getOrderStatus] = useGetOrderStatusMutation();

  const {
    data,
    error,
    isLoading,
    refetch: refetchHistory,
  } = useGetHistoryQuery(userId);
  const [activeTab, setActiveTab] = useState<"Analysis" | "History">(
    "Analysis"
  );
  const [history, setHistory] = useState<HistoryState>({
    list: [],
    loading: isLoading,
    error: null,
  });
  const [getHistoryByIdTrigger] = useLazyGetHistoryByIdQuery();

  const [analysis, setAnlaysis] = useState<Analysis>({
    response: null,
    analysisId: -1,
    fileName: "",
    factor: "",
    feedback: "Not Responded",
    running: false,
    language:"",
    error: false,
  });

  const [historyDetail, setHistoryDetail] = useState<any>({
    loading: false,
    error: null,
    response: null,
    analysisId: -1,
    fileName: "",
    factor: "",
    language: "",
    feedback: "Not Responded",
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [load, setLoad] = useState(false);

  // State for the selected factor from the dropdown
  const [selectedFactor, setSelectedFactor] = useState<string>("");
  const [fileInfo, setFileInfo] = useState<{
    filePath: string;
    fileContent: string;
    fileName: string;
  } | null>(null);

  const [callRestApiOpenAi3_5] = useCallRestApiOpenAi3_5Mutation();

  useEffect(() => {
    setHistory({
      list: error ? [] : data ? data.analysis_history : [],
      loading: false,
      error: error || null,
    });

    logFetchHistoryByUserId({ userId, data, error });
  }, [data, error]);

  // Request file information from VS Code extension on component mount
  useEffect(() => {
    // Send the request for file info when the component mounts
    requestFileInfo();

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const requestFileInfo = () => {
    postMessage({
      command: "requestFileInfo",
    });
  };

  const handleMessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.command === "fileContentResponse") {
      const { filePath, fileContent } = message;

      if (filePath && fileContent) {
        const normalizedPath = filePath.replace(/\\/g, "/");
        const fileName = normalizedPath.split("/").pop() || "";

        setFileInfo({
          filePath,
          fileContent,
          fileName,
        });
      }
    }
  };

  // useEffect to fetch order details on mount
  useEffect(() => {
    fetchOrderDetails();
  }, [userId]); // Empty dependency array ensures it runs once on mount

  const fetchOrderDetails = async () => {
    try {
      // const orderDetails = await getOrderDetails(userId).unwrap();

      const orderDetails = await fetchOrderDetailsWithLogging({
        getOrderDetails,
        userId,
      });

      // Extracting data from the response
      const { order_id, status: plan_status, plan } = orderDetails;
      const { plan_type } = plan;

      // Update the state with order details
      setPlanDetails({
        plan_auth: true, // Assuming 'active' means authorized
        order_id,
        plan_status,
        plan_type: plan_type, // Displaying the plan name instead of type
      });

      // If the order_id exists, fetch the order status
      if (order_id) {
        fetchOrderStatus(order_id);
      }
    } catch (error: any) {
      if (error.status === 404) {
        postMessage({
          command: "showNotification",
          text: "Order details not found. Please select any plan from codesherlock.ai page to access the factors.",
          error: true,
        });
      } else {
        postMessage({
          command: "showNotification",
          text: "Failed to fetch order details, There has been an unknown error in our system. We apologize. We are working on it. For further assistance reach out to support@codesherlock.ai. Please ensure you have a stable internet connection.",
          error: true,
        });
      }
    }
  };

  // Function to fetch order status after order_id is retrieved
  const fetchOrderStatus = async (order_id: string) => {
    try {
      // const orderStatus = await getOrderStatus(order_id).unwrap();
      const orderStatus = await fetchOrderStatusWithLogging({
        getOrderStatus,
        orderId: order_id,
      });
      const { status } = orderStatus;

      // Update the plan status in state
      setPlanDetails((prevState) => ({
        ...prevState,
        plan_status: status,
      }));
    } catch (error: any) {
      // Show  notification
      if (error.status === 404) {
        postMessage({
          command: "showNotification",
          text: "Payment plan not found!. Please select a plan from codesherlock.ai page to access the factors.",
          error: true,
        });
      } else {
        postMessage({
          command: "showNotification",
          text: "Failed to fetch order details, There has been an unknown error in our system. We apologize. We are working on it. For further assistance reach out to support@codesherlock.ai. Please ensure you have a stable internet connection.",
          error: true,
        });
      }
    }
  };

  const handleTabClick = (tab: "Analysis" | "History") => {
    setActiveTab(tab);
  };

  const validateInputs = (
    fileInfo: any,
    selectedFactor: string,
    setSubmitError: React.Dispatch<string>
  ) => {
    if (!fileInfo?.filePath) {
      setSubmitError("Please open a file in editor for being tracked");
      return false;
    }
    if (selectedFactor.trim() === "") {
      setSubmitError("Please select a factor from dropdown.");
      return false;
    }
    return true;
  };

  const handleError = (
    error: any,
    fileInfo: any,
    selectedFactor: string,
    setAnlaysisDetail: any
  ) => {
    const errorMessage =
      error?.data?.detail ||
      "There has been an unknown error in our system. We apologize. We are working on it. For further assistance reach out to support@codesherlock.ai. Please ensure you have a stable internet connection. If you were in the middle of an analysis, please check the history tab, the analysis may have completed.";
    setAnlaysisDetail((prevState: any) => ({
      ...prevState,
      analysis: {
        ...prevState.analysis,
        fileName: fileInfo.fileName,
        factor: selectedFactor,
        response: "",
        running: false,
        analysisId: -2,
        error: errorMessage,
      },
      error: null,
    }));
  };

  const setupWebSocket = async (setLoad: any) => {
    try {
      const ws = await setWebSocket(
        userId,
        setAnlaysis,
        setLoad,
        refetchHistory
      );
      return ws;
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setIsMarkdown(false);

    // Validation
    if (!validateInputs(fileInfo, selectedFactor, setSubmitError)) return;

    setHistoryDetail({
      loading: false,
      error: null,
      response: null,
      analysisId: -1,
      fileName: "",
      factor: "",
      language:"",
      feedback: "Not Responded",
    });

    setAnlaysis({
      response: null,
      analysisId: 0,
      fileName: fileInfo?.fileName || "",
      factor: selectedFactor || "",
      feedback: "",
      running: true,
      language:"",
      error: false,
    });

    try {
      setLoad(true);

      // WebSocket Setup
      await setupWebSocket(setLoad);

      // // Make the API call after setting up WebSocket
      await callOpenAi3_5WithLogging({
        callRestApiOpenAi3_5,
        file: fileInfo
          ? new File([fileInfo.fileContent], fileInfo.fileName)
          : undefined,
        factor: selectedFactor.toLocaleLowerCase(),
        temperature: 0.7, // Replace with actual temperature if dynamic
        pasted_code: "", // Add pasted code if needed
        uid: userId,
      });

      refetchHistory();
    } catch (error: any) {
      handleError(error, fileInfo, selectedFactor, setAnlaysis);
    }
  };

  // Handle history item click and fetch the history detail on-demand
  const handleHistoryItemClick = async (analysisid: number) => {
    setSubmitError("");
    // Set loading to true when starting the API call
    setHistoryDetail({
      loading: true,
      error: null,
      response: null,
      analysisId: analysisid,
      fileName: "",
      factor: "",
      language: "",
      feedback: "Not Responded",
    });

    setAnlaysis({
      response: null,
      analysisId: -1,
      fileName: "",
      factor: "",
      feedback: "",
      running: false,
      language:"",
      error: false,
    });

    setActiveTab("Analysis");

    try {
      // Trigger the API call and await the result
      const res = await fetchHistoryByIdWithLogging({
        getHistoryByIdTrigger,
        userId,
        analysisId: analysisid,
      });

      if (res.analysis_type === "markdown") {
        setOldAnalysis({
          loading: false,
          error: null,
          analysis: {
            response: transformText(res.analysis),
            analysisId: analysisid,
            fileName: res.file_name,
            factor: res.factor_name,
            feedback: res.feedback,
            running: false,
            error: null,
          },
        });

        setHistoryDetail({
          loading: false,
          error: null,

          response: null,
          analysisId: analysisid,
          fileName: "",
          factor: "",
          feedback: "Not Responded",
        });
        setIsMarkdown(true);
      } else {
        setIsMarkdown(false);
        // Update the analysis details after fetching the data
        setHistoryDetail({
          loading: false,
          error: null,
          response: res.analysis,
          analysisId: analysisid,
          fileName: res.file_name,
          factor: res.factor,
          language: res.language,
          feedback: res.feedback,
        });
      }
    } catch (error: any) {
      // Reset to initial state or handle error case if needed
      setHistoryDetail({
        loading: false,
        error:
          "Failed to fetch history detail. There has been an unknown error in our system. We apologize. We are working on it. For further assistance reach out to support@codesherlock.ai. Please ensure you have a stable internet connection.",
        response: null,
        analysisId: analysisid,
        fileName: "",
        factor: "",
        language: "",
        feedback: "Not Responded",
      });
    }
  };

  // Handle "Add new analysis" button click
  const handleAddNewAnalysis = () => {
    // Reset analysis details and switch to Analysis tab
    setAnlaysis({
      response: null,
      analysisId: -1,
      fileName: "",
      factor: "",
      feedback: "Not Responded",
      running: false,
      language:"",
      error: false,
    });
    setHistoryDetail({
      loading: false,
      error: null,
      response: null,
      analysisId: -1,
      fileName: "",
      factor: "",
      feedback: "Not Responded",
    });

    setOldAnalysis({
      loading: false,
      error: null,
      analysis: {
        response: null,
        analysisId: -1,
        fileName: "",
        factor: "",
        feedback: "Not Responded",
        running: false,
        error: false,
      },
    });
    setActiveTab("Analysis");
  };

  return (
    <div className="h-[100vh] overflow-hidden">
      {/* Tab headers */}
      <div className="flex border-b border-gray-300 fixed top-0 w-full z-10">
        <button
          className={`px-4 py-2 focus:outline-none ${
            activeTab === "Analysis"
              ? "border-b-2 border-blue-500"
              : "text-gray-600"
          }`}
          onClick={() => handleTabClick("Analysis")}
        >
          Analysis
        </button>

        <button
          className={`px-4 py-2 focus:outline-none ${
            activeTab === "History"
              ? "border-b-2 border-blue-500"
              : "text-gray-600"
          }`}
          onClick={() => handleTabClick("History")}
        >
          History
        </button>

        {/* Add new analysis button */}
        <div className="relative group">
          <button
            className="px-4 py-2 text-gray-600 focus:outline-none hover:text-blue-500 disabled:hover:text-gray-600"
            onClick={handleAddNewAnalysis}
            disabled={
              analysis.response === null &&
              historyDetail.response === null &&
              oldAnalysis.analysis.response === null
            }
          >
            +
          </button>

          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 px-2 w-[100px] py-1 bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-sidebar)] text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            New Analysis
          </div>
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "Analysis" && (
          <Analysis
            analysis={analysis}
            historyDetail={historyDetail}
            planDetails={planDetails}
            selectedFactor={selectedFactor}
            setSelectedFactor={setSelectedFactor}
            isMarkdown={isMarkdown}
            oldAnalysis={oldAnalysis}
          />
        )}

        {activeTab === "History" && (
          <History
            history={history}
            handleHistoryItemClick={handleHistoryItemClick}
            refetchHistory={refetchHistory}
          />
        )}
      </div>

      {/* Footer Section */}
      {activeTab === "Analysis" && (
        <>
          {/* Error message displayed above the footer */}
          {submitError && (
            <div className="text-red-500 fixed bottom-[100px] left-0 w-full">
              {submitError}
            </div>
          )}

          <div className="w-full fixed bottom-0">
            <div className="w-full ">
              <Factors
                selectedFactor={selectedFactor}
                planDetails={planDetails}
                setSelectedFactor={setSelectedFactor}
              />
            </div>

            <div className="flex flex-col border-t border-gray-300 p-4  w-full bg-[var(--vscode-editor-background)]">
              <div className="flex justify-between items-center gap-2">
                <span
                  className={`text-[var(--vscode-editor-sidebar)] ${
                    fileInfo?.fileName
                      ? "border text-center max-w-[200px] px-5 "
                      : "max-w-fit text px-0"
                  } border-gray-300 rounded-3xl  gap-5 w-fit py-2  truncate-text`}
                >
                  <span className="text-vscode-editor-fg ">
                    {fileInfo?.fileName
                      ? fileInfo.fileName
                      : "No code file is currently open"}
                  </span>
                </span>
                <button
                  className="bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-600"
                  onClick={handleSubmit}
                  disabled={load}
                >
                  {load ? <Pulse /> : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
export default Home;
